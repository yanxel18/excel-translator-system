import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { IdentityProvider } from '../../generated/prisma/client';
import { PrismaService } from '../persistence/prisma.service';
import { KeycloakVerifierService } from './keycloak-verifier.service';
import { hashPassword, verifyPassword } from './passwords';
import { allowsConfiguredUserBootstrap } from './bootstrap-policy';

export interface AuthenticatedUser { userId: string; username: string; isAdmin: boolean; }

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
    if (!user?.enabled || !user.passwordHash || !(await verifyPassword(password, user.passwordHash))) return null;
    return { userId: user.id, username: user.username, isAdmin: this.isAdmin(user.username) };
  }

  async login(user: AuthenticatedUser) {
    const persisted = await this.prisma.user.findUnique({ where: { id: user.userId }, select: { enabled: true, sessionVersion: true } });
    if (!persisted?.enabled) throw new UnauthorizedException('Session is invalid or expired.');
    const payload = { username: user.username, sub: user.userId, sessionVersion: persisted.sessionVersion };
    return {
      access_token: this.jwtService.sign(payload),
    };
  }

  async verifySession(token: string): Promise<AuthenticatedUser> {
    let local: { sub: string; username: string; sessionVersion?: number } | undefined;
    try {
      local = await this.jwtService.verifyAsync(token);
    } catch {
      // A Keycloak token is verified below when OIDC is enabled.
    }
    if (local) {
      if (!local.sub || !local.username || (local.sessionVersion !== undefined && !Number.isInteger(local.sessionVersion))) {
        throw new UnauthorizedException('Session is invalid or expired.');
      }
      const user = await this.prisma.user.findUnique({ where: { id: local.sub }, select: { enabled: true, sessionVersion: true } });
      if (!user?.enabled || user.sessionVersion !== (local.sessionVersion ?? 0)) {
        throw new UnauthorizedException('Session is invalid or expired.');
      }
      return { userId: local.sub, username: local.username, isAdmin: this.isAdmin(local.username) };
    }
    return this.findOrCreateKeycloakUser(await this.keycloak.verify(token));
  }

  async exchangeKeycloakToken(token: string) {
    if (!token) throw new UnauthorizedException('A Keycloak access token is required.');
    const user = await this.findOrCreateKeycloakUser(await this.keycloak.verify(token));
    return this.login(user);
  }

  private async findOrCreateKeycloakUser(claims: Awaited<ReturnType<KeycloakVerifierService['verify']>>): Promise<AuthenticatedUser> {
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider: IdentityProvider.KEYCLOAK, subject: claims.sub } },
      include: { user: true },
    });
    let user = identity?.user;
    if (!user) {
      const existingEmail = claims.email
        ? await this.prisma.user.findUnique({ where: { email: claims.email }, select: { id: true } })
        : null;
      user = await this.prisma.user.create({
        data: {
          username: `keycloak-${claims.sub}`,
          email: existingEmail ? null : claims.email,
          fullName: claims.name || claims.preferred_username,
          identities: { create: { provider: IdentityProvider.KEYCLOAK, subject: claims.sub } },
        },
      });
    }
    if (!user.enabled) throw new UnauthorizedException('Session is invalid or expired.');
    const username = claims.preferred_username || user.username;
    return { userId: user.id, username, isAdmin: this.isAdmin(username) };
  }

  isAdmin(username: string): boolean {
    return (process.env.ADMIN_USERNAMES || '').split(',').map((name) => name.trim().toLowerCase()).includes(username.toLowerCase());
  }

  private async bootstrapDevelopmentUser(requestedUsername: string): Promise<void> {
    const configuredUsername = process.env.AUTH_USERNAME;
    const configuredPassword = process.env.AUTH_PASSWORD;
    if (!allowsConfiguredUserBootstrap() || !configuredUsername || !configuredPassword || requestedUsername !== configuredUsername) return;
    const existing = await this.prisma.user.findUnique({ where: { username: configuredUsername } });
    if (!existing) await this.prisma.user.create({ data: { username: configuredUsername, passwordHash: await hashPassword(configuredPassword) } });
  }
}
