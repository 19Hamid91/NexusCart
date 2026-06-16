# Product Requirement Document (PRD)

## Project: NexusCart — Logistics & Inventory Sync Engine

**Version:** 2.0  
**Status:** Approved for Development  
**Target Audience:** Backend Engineering / Portfolio Showcase (Remote — MY Market)

---

## 1. Executive Summary

NexusCart is a production-grade backend system engineered for high-concurrency e-commerce operations. It addresses three failure modes common in scaled e-commerce: **inventory overselling under concurrent load**, **tight coupling to fragile third-party logistics APIs**, and **synchronous webhook processing bottlenecks**.

The system is architected around event-driven, asynchronous patterns, with explicit concurrency controls at the database layer — making it directly relevant to the operational challenges faced by platforms such as Shopee, Lazada, and regional 3PL providers like NinjaVan and J&T.

---

## 2. Problem Statement

| Problem | Impact Without This System |
| :--- | :--- |
| Concurrent checkouts during flash sales | Race conditions → overselling → customer disputes |
| Blocking calls to courier APIs | Slow/failed courier = failed checkout for end-user |
| Synchronous webhook processing | High-volume status updates cause server timeouts |
| No stock reservation layer | Double-selling between stock check and deduction |

---

## 3. Objectives & Success Criteria

| Objective | Measurable Success Criteria |
| :--- | :--- |
| Prevent overselling | Zero negative stock occurrences under concurrent load (verified via load test) |
| Decouple logistics from checkout | Courier API failure must not fail the checkout response |
| Reliable webhook ingestion | 0% webhook payload loss under burst traffic |
| Developer experience | Full API contract documented via Swagger; all core flows covered by tests |

---

## 4. System Architecture

### 4.1 Architecture Pattern

```
Client Request
     │
     ▼
[NestJS HTTP Layer]
     │
     ├──► [PostgreSQL] ──► Row-Level Lock (SELECT FOR UPDATE)
     │         │                    │
     │    Transactions         Stock Deduction
     │
     ├──► [BullMQ Queue] ──► [Worker: CourierDispatch]
     │                               │
     │                        MockCourierService (axios)
     │                               │
     │                        Shipment Record Update
     │
     └──► [Webhook Receiver] ──► [BullMQ Queue] ──► [Worker: StatusSync]
```

### 4.2 Tech Stack

| Layer | Technology | Rationale |
| :--- | :--- | :--- |
| Runtime | Node.js + TypeScript (strict) | Type safety prevents entire classes of runtime errors |
| Framework | NestJS | Dependency injection, modular structure, decorator-based guards — standard in MY enterprise |
| Database | PostgreSQL + Prisma ORM | ACID compliance required for financial-grade stock operations |
| Cache / Queue | Redis + BullMQ | Persistent job queues with built-in retry, backoff, and dead-letter support |
| Documentation | Swagger (OpenAPI 3.0) | Auto-generated from decorators; importable into Postman |
| Testing | Jest + Supertest | Unit + integration coverage with mocked external dependencies |

### 4.3 Key Architectural Decisions

**Why separate the `Stocks` table from `Products`?**  
Row-level locking targets the narrowest possible scope. Locking a `stocks` row during checkout does not block concurrent reads of product metadata, minimising contention under flash-sale traffic.

**Why BullMQ over direct async calls?**  
BullMQ jobs are persisted to Redis before acknowledgement. If the worker process crashes mid-flight, the job is retried automatically with configurable exponential backoff — courier API downtime never causes data loss.

**Why offload webhooks to a queue?**  
Courier services like NinjaVan can fire thousands of status callbacks in short bursts (e.g., post-bulk-dispatch). Accepting the payload, enqueuing it, and returning `202 Accepted` immediately keeps p99 webhook receiver latency under 50ms regardless of downstream processing time.

---

## 5. Domain Model

### 5.1 Entity Relationship Summary

```
Products ──< Stocks         (1:1, separated for lock granularity)
Products ──< OrderItems     (1:N)
Orders   ──< OrderItems     (1:N)
Orders   ──< Shipments      (1:1)
```

### 5.2 Database Schema

| Table | Key Fields | Notes |
| :--- | :--- | :--- |
| `products` | `id` UUID PK, `name`, `sku` UNIQUE, `price` DECIMAL, `created_at` | `sku` uniqueness enforced at DB level, not just application layer |
| `stocks` | `id` UUID PK, `product_id` FK, `quantity` INT, `reserved_quantity` INT | `CHECK (quantity >= 0)` DB constraint as last-resort guard |
| `orders` | `id` UUID PK, `user_id`, `total_amount` DECIMAL, `status` ENUM | Status: `PENDING_PAYMENT → PAID → DISPATCHED → CANCELLED` |
| `order_items` | `id` UUID PK, `order_id` FK, `product_id` FK, `quantity`, `unit_price` | `unit_price` snapshot at order time; immune to future price changes |
| `shipments` | `id` UUID PK, `order_id` FK UNIQUE, `tracking_id`, `courier_name`, `status` ENUM | Status: `PROCESSING → PICKED_UP → IN_TRANSIT → DELIVERED` |

### 5.3 Critical Schema Constraints

- `stocks.quantity`: `CHECK (quantity >= 0)` — database-level guard against application bugs
- `order_items.unit_price`: snapshotted at checkout, never references live product price
- `shipments.order_id`: UNIQUE constraint — prevents duplicate shipment records per order
- All monetary values: `DECIMAL(12, 2)` — never `FLOAT` for financial data

---

## 6. Core Feature Specifications

### Feature 1: Inventory Management with Concurrency Control

**Business Rule:** Stock must never go negative. Simultaneous checkouts for the same product must not both succeed if combined quantity exceeds available stock.

**Implementation:**

```sql
-- Inside a serializable transaction
SELECT quantity FROM stocks
WHERE product_id = $1
FOR UPDATE;  -- Exclusive row lock held until transaction commits

UPDATE stocks
SET quantity = quantity - $requested
WHERE product_id = $1
  AND quantity >= $requested;  -- Atomic guard
```

**Failure Mode Handled:** If two requests acquire the lock concurrently, the second waits. When it proceeds, the guard clause `quantity >= requested` may fail, returning a clean `409 Conflict` to the second caller.

**Stock State Machine:**
```
available_quantity = quantity - reserved_quantity
```

---

### Feature 2: Order & Checkout Flow

**Order Status Lifecycle:**
```
PENDING_PAYMENT → PAID → DISPATCHED
                       → CANCELLED (on dispatch failure after retries exhausted)
```

**Checkout Sequence:**
1. Validate all `OrderItems` against available stock (within transaction)
2. Lock relevant `stocks` rows (`SELECT FOR UPDATE`)
3. Deduct quantities atomically
4. Create `Order` record with status `PENDING_PAYMENT`
5. Return `order_id` to client

**Payment Confirmation Sequence:**
1. Update `Order.status` → `PAID`
2. Enqueue `CourierDispatchJob` to BullMQ (non-blocking)
3. Return `200 OK` immediately — logistics processing is fully asynchronous

---

### Feature 3: 3PL Courier Integration (Sandbox)

**Purpose:** Simulate the integration pattern used with production couriers (NinjaVan, J&T, Lalamove) to demonstrate the architectural pattern without real API keys.

**MockCourierService contract:**
```typescript
interface CourierDispatchPayload {
  orderId: string;
  recipientName: string;
  recipientAddress: string;
  items: { sku: string; quantity: number }[];
}

interface CourierDispatchResponse {
  trackingId: string;
  estimatedDelivery: string; // ISO 8601
}
```

**Simulated behaviour:** 2-second latency, 10% random failure rate — demonstrates retry logic in BullMQ worker.

**BullMQ Worker Configuration:**
```typescript
{
  attempts: 5,
  backoff: { type: 'exponential', delay: 2000 }, // 2s, 4s, 8s, 16s, 32s
  removeOnComplete: { age: 86400 },  // retain 24h for audit
  removeOnFail: false                // dead-letter: never auto-purge failed jobs
}
```

---

### Feature 4: Webhook Receiver & Async Status Sync

**Inbound Webhook Payload (from courier):**
```json
{
  "tracking_id": "NVAN-20240101-XXXX",
  "status": "DELIVERED",
  "timestamp": "2024-01-01T14:30:00Z",
  "signature": "hmac-sha256-value"
}
```

**Security:** HMAC-SHA256 signature validation on every inbound webhook before enqueuing. Reject unsigned payloads with `401 Unauthorized`.

**Processing Flow:**
```
POST /webhooks/courier
  │
  ├─► Validate HMAC signature
  ├─► Enqueue to BullMQ (StatusSyncQueue)
  └─► Return 202 Accepted   ← always fast, regardless of queue depth

[StatusSyncWorker]
  ├─► Dequeue job
  ├─► Lookup Shipment by tracking_id
  ├─► Update Shipment.status
  └─► (Future: emit OrderStatusChangedEvent for notification service)
```

---

## 7. API Specification

All endpoints are prefixed `/api/v1`. Full contract available via Swagger at `/api/docs`.

### 7.1 Products & Inventory

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/products` | Public | List all products with real-time available stock |
| `GET` | `/products/:id` | Public | Single product detail with stock |
| `POST` | `/stocks/topup` | Admin JWT | Replenish stock for a product |

### 7.2 Orders

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/orders/checkout` | User JWT | Atomic stock deduction + order creation |
| `GET` | `/orders/:id` | User JWT | Order detail + current shipment status |
| `POST` | `/orders/:id/payment-success` | Internal / Webhook | Simulate payment capture, triggers dispatch job |
| `POST` | `/orders/:id/cancel` | User JWT | Cancel `PENDING_PAYMENT` orders, release reserved stock |

### 7.3 Webhooks

| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/webhooks/courier` | HMAC Signature | Receive courier status updates |

### 7.4 Standard Error Response Shape

```json
{
  "statusCode": 409,
  "error": "Conflict",
  "message": "Insufficient stock for product SKU-001",
  "timestamp": "2024-01-01T10:00:00Z",
  "path": "/api/v1/orders/checkout"
}
```

---

## 8. Testing Strategy

| Layer | Tool | Coverage Target | What to Test |
| :--- | :--- | :--- | :--- |
| Unit | Jest | ≥ 90% on service layer | Stock deduction logic, order state transitions, HMAC validation |
| Integration | Jest + Supertest | All API endpoints | Full request/response cycle with test DB |
| Concurrency | Artillery or k6 | — | 50 simultaneous checkout requests for 1 unit of stock → exactly 1 success |
| Failure / Chaos | Jest (mocked) | — | Courier API timeout → job retry; 5 retries exhausted → order `CANCELLED` |

**Critical test: Concurrency Guard**
```typescript
it('should allow only 1 successful checkout when 50 concurrent requests compete for 1 unit', async () => {
  const requests = Array(50).fill(null).map(() => checkoutRequest(productId, qty: 1));
  const results = await Promise.allSettled(requests);
  const successes = results.filter(r => r.status === 'fulfilled' && r.value.statusCode === 201);
  expect(successes).toHaveLength(1);
});
```

---

## 9. Non-Functional Requirements

| Concern | Requirement |
| :--- | :--- |
| Concurrency | Must handle 100 concurrent checkout requests without data corruption |
| Latency | Checkout endpoint p95 < 500ms (excluding courier dispatch, which is async) |
| Reliability | BullMQ jobs must survive process restart without data loss |
| Observability | Structured JSON logs on all queue job lifecycle events (start, complete, fail, retry) |
| Security | JWT auth on protected routes; HMAC validation on webhooks; no raw SQL except explicit lock queries |
| Env config | All secrets via `.env`; no credentials in source; `.env.example` committed |

---

## 10. Out of Scope (MVP)

- Real payment gateway integration (Stripe, iPay88, Billplz) — simulated only
- Multi-warehouse / multi-region stock allocation
- Real-time stock push via WebSocket or SSE
- Customer-facing notification service (email, SMS) — architecture stub included, not implemented

---

## 11. Repository Documentation Guide (GitHub Showcase)

This section defines what the `README.md` must communicate to a hiring engineer reviewing this project.

**Required README sections:**

1. **Architecture Diagram** — ASCII or Mermaid diagram showing the async flow (HTTP → Queue → Worker → DB)
2. **The Race Condition Problem** — Explain the failure mode with a before/after: naive implementation vs. `SELECT FOR UPDATE`
3. **Why Queues, Not Async/Await** — Distinguish `async/await` (waits for result, blocks on failure) from BullMQ (fire-and-forget with durability)
4. **Local Setup** — Docker Compose for Postgres + Redis; single `docker-compose up` to run everything
5. **Running the Concurrency Test** — Step-by-step to execute the Artillery/k6 load test and interpret results
6. **API Reference** — Link to Swagger UI running on the Docker instance

**Talking points for interviews (MY remote market):**
- "I separated the `stocks` table from `products` specifically to minimize lock contention during high-concurrency events — a pattern used by platforms handling flash sales."
- "The webhook receiver returns `202 Accepted` synchronously and delegates all processing to BullMQ, which means courier downtime or slow processing never propagates latency back to the caller."
- "Failed courier dispatch jobs are never auto-deleted — they sit in a dead-letter state so operations teams can inspect and manually retry without data loss."
