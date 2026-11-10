import { Injectable, UnauthorizedException } from '@nestjs/common';
import jwt, { JwtHeader, JwtPayload, SigningKeyCallback } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

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
  async verify(token: string): Promise<KeycloakClaims> {
    if (process.env.KEYCLOAK_ENABLED !== 'true') throw new UnauthorizedException('Session is invalid or expired.');
    const issuer = process.env.KEYCLOAK_ISSUER_URL?.replace(/\/$/, '');
    const clientId = process.env.KEYCLOAK_CLIENT_ID;
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
    const requiredGroup = process.env.KEYCLOAK_REQUIRED_GROUP;
    if (requiredGroup && !claims.groups?.includes(requiredGroup)) throw new UnauthorizedException('Keycloak group membership is required.');
    return claims;
  }
}
