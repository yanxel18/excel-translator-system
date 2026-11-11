import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import jwt, { JwtHeader, JwtPayload, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { PrismaService } from '../persistence/prisma.service';

export interface KeycloakClaims extends JwtPayload {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  azp?: string;
  groups?: string[];
}

@Injectable()
export class KeycloakVerifierService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const stored = await this.prisma.oidcSettings.findUnique({ where: { id: 'default' } });
    const issuerUrl = stored?.issuerUrl ?? process.env.KEYCLOAK_ISSUER_URL ?? '';
    const issuerRealm = issuerUrl.match(/\/realms\/([^/]+)/)?.[1] ?? '';
    const issuerHost = issuerUrl.replace(/\/realms\/[^/]+.*$/, '');
    return {
      enabled: stored?.enabled ?? process.env.KEYCLOAK_ENABLED === 'true',
      keycloakUrl: stored ? stored.keycloakUrl ?? '' : process.env.KEYCLOAK_URL || issuerHost,
      realm: stored ? stored.realm ?? '' : process.env.KEYCLOAK_REALM || issuerRealm,
      clientId: stored?.clientId ?? process.env.KEYCLOAK_CLIENT_ID ?? '',
      issuerUrl,
      requiredGroup: stored?.requiredGroup ?? process.env.KEYCLOAK_REQUIRED_GROUP ?? '',
    };
  }

  async getPublicConfig() {
    const { enabled, keycloakUrl, realm, clientId } = await this.getSettings();
    return { enabled, url: keycloakUrl, realm, clientId };
  }

  async updateSettings(input: Record<string, unknown>) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new BadRequestException('OIDC settings are required.');
    const enabled = input.enabled;
    const keycloakUrl = typeof input.keycloakUrl === 'string' ? input.keycloakUrl.trim().replace(/\/$/, '') : '';
    const realm = typeof input.realm === 'string' ? input.realm.trim() : '';
    const clientId = typeof input.clientId === 'string' ? input.clientId.trim() : '';
    const issuerUrl = typeof input.issuerUrl === 'string' ? input.issuerUrl.trim().replace(/\/$/, '') : '';
    const requiredGroup = typeof input.requiredGroup === 'string' ? input.requiredGroup.trim() : '';
    if (typeof enabled !== 'boolean') throw new BadRequestException('OIDC enabled must be true or false.');
    for (const value of [keycloakUrl, issuerUrl]) {
      if (!value) continue;
      try {
        const protocol = new URL(value).protocol;
        if (protocol !== 'https:' && protocol !== 'http:') throw new Error();
      } catch { throw new BadRequestException('Keycloak URLs must be valid HTTP or HTTPS URLs.'); }
    }
    if (enabled && (!keycloakUrl || !realm || !clientId || !issuerUrl)) {
      throw new BadRequestException('URL, realm, client ID, and issuer are required when OIDC is enabled.');
    }
    if (realm.length > 128 || clientId.length > 256 || requiredGroup.length > 512) {
      throw new BadRequestException('OIDC settings exceed the allowed length.');
    }
    return this.prisma.oidcSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', enabled, keycloakUrl, realm, clientId, issuerUrl, requiredGroup },
      update: { enabled, keycloakUrl, realm, clientId, issuerUrl, requiredGroup },
    });
  }

  async verify(token: string): Promise<KeycloakClaims> {
    const settings = await this.getSettings();
    if (!settings.enabled) throw new UnauthorizedException('Session is invalid or expired.');
    const issuer = settings.issuerUrl?.replace(/\/$/, '');
    const clientId = settings.clientId;
    if (!issuer || !clientId) throw new UnauthorizedException('Keycloak is not configured.');
    const client = jwksClient({ jwksUri: `${issuer}/protocol/openid-connect/certs`, cache: true, rateLimit: true });
    const getKey = (header: JwtHeader, callback: SigningKeyCallback) => {
      if (!header.kid) return callback(new Error('Keycloak token has no signing key id.'));
      client.getSigningKey(header.kid).then((key) => callback(null, key.getPublicKey())).catch(callback);
    };
    const claims = await new Promise<KeycloakClaims>((resolve, reject) => {
      jwt.verify(token, getKey, { algorithms: ['RS256'], issuer }, (error, decoded) => {
        if (error || !decoded || typeof decoded === 'string') return reject(error || new Error('Invalid Keycloak token.'));
        resolve(decoded as KeycloakClaims);
      });
    });
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(clientId) && claims.azp !== clientId) throw new UnauthorizedException('Keycloak token is not issued for this client.');
    const requiredGroup = settings.requiredGroup;
    if (requiredGroup && !claims.groups?.includes(requiredGroup)) throw new UnauthorizedException('Keycloak group membership is required.');
    return claims;
  }
}
