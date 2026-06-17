// src/common/dto/api-response.dto.ts
export class ApiResponse<T> {
  success: boolean;
  message: string;
  RecordCount: number;
  data: T;

  constructor(data: T, message = 'Success', success = true) {
    this.success = success;
    this.message = message;
    this.data = data;
    this.RecordCount = Array.isArray(data) ? data.length : 1;
  }
}
