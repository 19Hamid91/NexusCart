export class CheckoutDto {
  userId: string;
  items: {
    productId: string;
    quantity: number;
    unitPrice: number;
  }[];
}
