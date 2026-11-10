import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { AuthenticationService } from '../authentication/authentication.service';

@Injectable()
export class GraphqlAuthGuard implements CanActivate {
  constructor(private readonly authentication: AuthenticationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = GqlExecutionContext.create(context).getContext().req;
    const authorization = request.headers.authorization as string | undefined;
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) throw new UnauthorizedException('A bearer token is required.');
    try { request.user = await this.authentication.verifySession(token); return true; }
    catch { throw new UnauthorizedException('Session is invalid or expired.'); }
  }
}
