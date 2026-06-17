import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class JwtGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const token = authHeader.split(' ')[1];
    try {
      // Mock token decoding / validation
      // Request user is populated for downstream service use
      request.user = { id: '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d' };
      return true;
    } catch (error) {
      throw new UnauthorizedException('Token validation failed');
    }
  }
}
