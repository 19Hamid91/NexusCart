export class PrismaClient {
  $connect = jest.fn();
  $disconnect = jest.fn();
  $transaction = jest.fn((cb) => cb(this));
}
