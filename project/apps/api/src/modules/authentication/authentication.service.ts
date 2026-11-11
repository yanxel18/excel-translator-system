import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IdentityProvider } from '../../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { KeycloakVerifierService } from './keycloak-verifier.service';
import { hashPassword, verifyPassword } from './passwords';
import { allowsConfiguredUserBootstrap } from './bootstrap-policy';

export interface AuthenticatedUser { userId: string; username: string; }

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly keycloak: KeycloakVerifierService,
  ) {}

  async validateUser(username: string, password: string): Promise<AuthenticatedUser | null> {
    if (process.env.LOCAL_AUTH_ENABLED !== 'true' || !username || !password) return null;
    await this.bootstrapDevelopmentUser(username);
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) return null;
    return { userId: user.id, username: user.username };
  }

  async login(user: AuthenticatedUser) {
    const payload = { username: user.username, sub: user.userId };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async verifySession(token: string): Promise<AuthenticatedUser> {
    try {
      const local = await this.jwtService.verifyAsync<{ sub: string; username: string }>(token);
      if (local?.sub && local.username) return { userId: local.sub, username: local.username };
    } catch {
      // A Keycloak token is verified below when OIDC is enabled.
    }
    const claims = await this.keycloak.verify(token);
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider: IdentityProvider.KEYCLOAK, subject: claims.sub } },
      include: { user: true },
    });
    const user = identity?.user ?? await this.prisma.user.create({
      data: {
        username: `keycloak-${claims.sub}`,
        email: claims.email,
        fullName: claims.name || claims.preferred_username,
        identities: { create: { provider: IdentityProvider.KEYCLOAK, subject: claims.sub } },
      },
    });
    return { userId: user.id, username: claims.preferred_username || user.username };
  }

  private async bootstrapDevelopmentUser(requestedUsername: string): Promise<void> {
    const configuredUsername = process.env.AUTH_USERNAME;
    const configuredPassword = process.env.AUTH_PASSWORD;
    if (!allowsConfiguredUserBootstrap() || !configuredUsername || !configuredPassword || requestedUsername !== configuredUsername) return;
    const existing = await this.prisma.user.findUnique({ where: { username: configuredUsername } });
    if (!existing) await this.prisma.user.create({ data: { username: configuredUsername, passwordHash: await hashPassword(configuredPassword) } });
  }
}
