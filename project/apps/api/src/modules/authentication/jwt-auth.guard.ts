import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthenticationService } from "./authentication.service";
import { OidcFullNameTooLongException } from "./oidc-full-name.exception";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authentication: AuthenticationService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers.authorization as string | undefined;
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException("A bearer token is required.");
    try {
      request.user = await this.authentication.verifySession(token);
      return true;
    } catch (error) {
      if (error instanceof OidcFullNameTooLongException) throw error;
      throw new UnauthorizedException("Session is invalid or expired.");
    }
  }
}
