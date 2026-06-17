# NexusCart API Documentation

This document describes the API endpoints for the NexusCart Logistics & Inventory Sync Engine.

## Base URL
All API requests are prefixed with:
`http://localhost:3000` (or your configured application port).

---

## Authentication
Some endpoints are protected using the standard NestJS `JwtGuard`. 
Provide the authentication token in the `Authorization` header:

```http
Authorization: Bearer <your_jwt_token>
```
*Note: For testing, the guard accepts any bearer token and populates a mock user with ID `1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d`.*

---

## API Response Format
All GET data-fetching or list-based responses adhere to the standard response shape containing:
- `success` (boolean): Indicates request outcome.
- `message` (string): Text describing the result.
- `RecordCount` (number): Number of items in the list or `1` for single objects.
- `data` (array or object): Actual response payload.

---

## Endpoints

### 1. Products Module

#### 1.1 List All Products
- **Endpoint**: `GET /products`
- **Authentication**: None
- **Response Shape**:
  ```json
  {
    "success": true,
    "message": "Products retrieved successfully",
    "RecordCount": 2,
    "data": [
      {
        "id": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
        "name": "Sony PlayStation 5",
        "sku": "PS5-001",
        "price": "499.99",
        "createdAt": "2026-06-17T04:22:00.000Z",
        "stock": {
          "id": "cf6378e9-d75d-4f24-9b21-69e120f269ba",
          "productId": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
          "quantity": 10,
          "reservedQuantity": 0
        }
      }
    ]
  }
  ```

#### 1.2 Get Product by ID
- **Endpoint**: `GET /products/:id`
- **Authentication**: None
- **URL Parameters**:
  - `id` (UUID): Product identifier.
- **Response Shape**:
  ```json
  {
    "success": true,
    "message": "Product retrieved successfully",
    "RecordCount": 1,
    "data": {
      "id": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
      "name": "Sony PlayStation 5",
      "sku": "PS5-001",
      "price": "499.99",
      "createdAt": "2026-06-17T04:22:00.000Z",
      "stock": {
        "id": "cf6378e9-d75d-4f24-9b21-69e120f269ba",
        "productId": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
        "quantity": 10,
        "reservedQuantity": 0
      }
    }
  }
  ```

#### 1.3 Replenish Stock
- **Endpoint**: `POST /products/replenish`
- **Authentication**: None
- **Body Payload** (`application/json`):
  ```json
  {
    "productId": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
    "quantity": 25
  }
  ```
- **Response Shape**:
  ```json
  {
    "success": true,
    "message": "Stock replenished successfully",
    "RecordCount": 1,
    "data": {
      "id": "cf6378e9-d75d-4f24-9b21-69e120f269ba",
      "productId": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
      "quantity": 35,
      "reservedQuantity": 0
    }
  }
  ```

---

### 2. Orders Module

#### 2.1 Checkout (Reserve Stock)
- **Endpoint**: `POST /orders/checkout`
- **Authentication**: Required (`Bearer` Token)
- **Body Payload** (`application/json`):
  ```json
  {
    "userId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "items": [
      {
        "productId": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
        "quantity": 2,
        "unitPrice": 499.99
      }
    ]
  }
  ```
- **Response Shape**:
  ```json
  {
    "success": true,
    "message": "Checkout successful and order created",
    "RecordCount": 1,
    "data": {
      "id": "673f32e9-e85d-4f24-9b21-42e120f262ab",
      "userId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "totalAmount": "999.98",
      "status": "PENDING_PAYMENT",
      "createdAt": "2026-06-17T04:30:00.000Z",
      "items": [
        {
          "id": "item-993",
          "orderId": "673f32e9-e85d-4f24-9b21-42e120f262ab",
          "productId": "8c67c87c-ef93-4ee1-b9de-c276a75043bf",
          "quantity": 2,
          "unitPrice": "499.99"
        }
      ]
    }
  }
  ```

#### 2.2 Pay Order (Capture Payment)
- **Endpoint**: `POST /orders/:id/pay`
- **Authentication**: Required (`Bearer` Token)
- **URL Parameters**:
  - `id` (UUID): Order identifier.
- **Response Shape**:
  ```json
  {
    "success": true,
    "message": "Payment captured and shipment initialized",
    "RecordCount": 1,
    "data": {
      "order": {
        "id": "673f32e9-e85d-4f24-9b21-42e120f262ab",
        "userId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
        "totalAmount": "999.98",
        "status": "PAID",
        "createdAt": "2026-06-17T04:30:00.000Z"
      },
      "shipment": {
        "id": "shipment-uuid-99",
        "orderId": "673f32e9-e85d-4f24-9b21-42e120f262ab",
        "courierName": "JNE",
        "status": "PROCESSING",
        "updatedAt": "2026-06-17T04:31:00.000Z"
      }
    }
  }
  ```
  *Note: This triggers a background task (`dispatch-job`) to generate a courier tracking ID and transition status to `DISPATCHED`.*

#### 2.3 Get Order by ID
- **Endpoint**: `GET /orders/:id`
- **Authentication**: Required (`Bearer` Token)
- **URL Parameters**:
  - `id` (UUID): Order identifier.
- **Response Shape**:
  ```json
  {
    "success": true,
    "message": "Order retrieved successfully",
    "RecordCount": 1,
    "data": {
      "id": "673f32e9-e85d-4f24-9b21-42e120f262ab",
      "userId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
      "totalAmount": "999.98",
      "status": "DISPATCHED",
      "createdAt": "2026-06-17T04:30:00.000Z",
      "items": [...],
      "shipment": {
        "id": "shipment-uuid-99",
        "orderId": "673f32e9-e85d-4f24-9b21-42e120f262ab",
        "trackingId": "TRK-245892",
        "courierName": "JNE",
        "status": "PICKED_UP",
        "updatedAt": "2026-06-17T04:32:00.000Z"
      }
    }
  }
  ```

---

### 3. Webhooks Module

#### 3.1 Courier Status Webhook
- **Endpoint**: `POST /webhooks/courier`
- **Authentication**: HMCS-Signature (`x-courier-signature` header)
- **Headers**:
  - `x-courier-signature`: Hash signature validation header.
- **Body Payload** (`application/json`):
  ```json
  {
    "orderId": "673f32e9-e85d-4f24-9b21-42e120f262ab",
    "status": "DELIVERED"
  }
  ```
- **Response (Synchronous)**: `202 Accepted`
  ```json
  {
    "success": true,
    "message": "Payload received and queued"
  }
  ```
  *Note: The webhook processes asynchronously using the `status-sync` BullMQ queue. The response is returned immediately within 50ms.*
