import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { JwtHeader, JwtPayload, SigningKeyCallback } from "jsonwebtoken";
import jwksClient = require("jwks-rsa");
import { AuthenticationMode } from "../../generated/prisma/client";
import { recordManagementAudit } from "../../common/management-audit";
import { PrismaService } from "../persistence/prisma.service";

export interface KeycloakClaims extends JwtPayload {
  sub: string;
  preferred_username?: string;
  email?: string;
  name?: string;
  azp?: string;
  groups?: string[];
}

export interface KeycloakSettingsSource {
  mode?: AuthenticationMode | null;
  enabled?: boolean | null;
  keycloakUrl?: string | null;
  realm?: string | null;
  clientId?: string | null;
  issuerUrl?: string | null;
  requiredGroup?: string | null;
}

export function resolveKeycloakSettings(
  stored: KeycloakSettingsSource | null,
) {
  const issuerUrl =
    stored?.issuerUrl ?? process.env.KEYCLOAK_ISSUER_URL ?? "";
  const issuerRealm = issuerUrl.match(/\/realms\/([^/]+)/)?.[1] ?? "";
  const issuerHost = issuerUrl.replace(/\/realms\/[^/]+.*$/, "");
  const legacyEnabled =
    stored?.enabled ?? process.env.KEYCLOAK_ENABLED === "true";
  const mode: AuthenticationMode =
    stored?.mode ??
    (stored
      ? legacyEnabled
        ? AuthenticationMode.HYBRID
        : AuthenticationMode.LOCAL
      : legacyEnabled && process.env.LOCAL_AUTH_ENABLED === "true"
        ? AuthenticationMode.HYBRID
        : legacyEnabled
          ? AuthenticationMode.OIDC
          : AuthenticationMode.LOCAL);
  return {
    mode,
    enabled: mode !== AuthenticationMode.LOCAL,
    keycloakUrl: stored
      ? (stored.keycloakUrl ?? "")
      : process.env.KEYCLOAK_URL || issuerHost,
    realm: stored
      ? (stored.realm ?? "")
      : process.env.KEYCLOAK_REALM || issuerRealm,
    clientId: stored?.clientId ?? process.env.KEYCLOAK_CLIENT_ID ?? "",
    issuerUrl,
    requiredGroup:
      stored?.requiredGroup ?? process.env.KEYCLOAK_REQUIRED_GROUP ?? "",
  };
}

@Injectable()
export class KeycloakVerifierService {
  constructor(private readonly prisma: PrismaService) {}

  async getSettings() {
    const stored = await this.prisma.oidcSettings.findUnique({
      where: { id: "default" },
    });
    return resolveKeycloakSettings(stored);
  }

  async getPublicConfig() {
    const { mode, enabled, keycloakUrl, realm, clientId } =
      await this.getSettings();
    return { mode, enabled, url: keycloakUrl, realm, clientId };
  }

  async updateSettings(input: Record<string, unknown>, actorId: string) {
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new BadRequestException("OIDC settings are required.");
    const modeValue = input.mode;
    const legacyEnabled = input.enabled;
    if (modeValue === undefined && typeof legacyEnabled !== "boolean") {
      throw new BadRequestException("Authentication mode is required.");
    }
    if (legacyEnabled !== undefined && typeof legacyEnabled !== "boolean") {
      throw new BadRequestException("OIDC enabled must be true or false.");
    }
    const mode =
      modeValue === undefined
        ? legacyEnabled
          ? AuthenticationMode.HYBRID
          : AuthenticationMode.LOCAL
        : modeValue;
    if (
      !Object.values(AuthenticationMode).includes(mode as AuthenticationMode)
    ) {
      throw new BadRequestException(
        "Authentication mode must be LOCAL, OIDC, or HYBRID.",
      );
    }
    const typedMode = mode as AuthenticationMode;
    const enabled = typedMode !== AuthenticationMode.LOCAL;
    if (legacyEnabled !== undefined && legacyEnabled !== enabled) {
      throw new BadRequestException(
        "OIDC enabled must match the selected authentication mode.",
      );
    }
    const value = (key: string, maxLength: number): string => {
      const current = input[key];
      if (
        current !== undefined &&
        current !== null &&
        (typeof current !== "string" || current.length > maxLength)
      ) {
        throw new BadRequestException(`Invalid ${key}.`);
      }
      return typeof current === "string" ? current.trim() : "";
    };
    const keycloakUrl = value("keycloakUrl", 2048).replace(/\/+$/, "");
    const realm = value("realm", 128);
    const clientId = value("clientId", 256);
    const issuerUrl = value("issuerUrl", 2048).replace(/\/+$/, "");
    const requiredGroup = value("requiredGroup", 512);

    const keycloak = keycloakUrl
      ? this.parseSafeUrl(keycloakUrl, "Keycloak URL")
      : null;
    const issuer = issuerUrl
      ? this.parseSafeUrl(issuerUrl, "Issuer URL")
      : null;
    if (
      typedMode !== AuthenticationMode.LOCAL &&
      (!keycloakUrl || !realm || !clientId || !issuerUrl)
    ) {
      throw new BadRequestException(
        "Keycloak URL, realm, client ID, and issuer are required for OIDC and HYBRID modes.",
      );
    }
    if (typedMode !== AuthenticationMode.LOCAL && keycloak && issuer) {
      const realmSegment = encodeURIComponent(realm);
      const basePath = keycloak.pathname.replace(/\/+$/, "");
      if (
        issuer.origin !== keycloak.origin ||
        issuer.pathname !== `${basePath}/realms/${realmSegment}`
      ) {
        throw new BadRequestException(
          "Issuer URL must match the configured Keycloak URL and realm.",
        );
      }
    }
    if (realm && /[\u0000-\u0020/\\?#]/.test(realm)) {
      throw new BadRequestException("Realm must be a single path segment.");
    }
    return this.prisma.$transaction(async (client) => {
      const tx = client as any;
      const settings = await tx.oidcSettings.upsert({
        where: { id: "default" },
        create: {
          id: "default",
          mode: typedMode,
          enabled,
          keycloakUrl,
          realm,
          clientId,
          issuerUrl,
          requiredGroup,
        },
        update: {
          mode: typedMode,
          enabled,
          keycloakUrl,
          realm,
          clientId,
          issuerUrl,
          requiredGroup,
        },
      });
      await recordManagementAudit(
        tx,
        actorId,
        "AUTHENTICATION_SETTINGS_UPDATED",
        "AUTHENTICATION",
        "default",
        [
          "mode",
          "enabled",
          "keycloakUrl",
          "realm",
          "clientId",
          "issuerUrl",
          "requiredGroup",
        ],
      );
      return settings;
    });
  }

  async verify(token: string): Promise<KeycloakClaims> {
    const settings = await this.getSettings();
    if (settings.mode === AuthenticationMode.LOCAL)
      throw new UnauthorizedException("Session is invalid or expired.");
    const issuer = settings.issuerUrl?.replace(/\/$/, "");
    const clientId = settings.clientId;
    if (!issuer || !clientId)
      throw new UnauthorizedException("Keycloak is not configured.");
    const client = jwksClient({
      jwksUri: `${issuer}/protocol/openid-connect/certs`,
      cache: true,
      rateLimit: true,
    });
    const getKey = (header: JwtHeader, callback: SigningKeyCallback) => {
      if (!header.kid)
        return callback(new Error("Keycloak token has no signing key id."));
      client
        .getSigningKey(header.kid)
        .then((key) => callback(null, key.getPublicKey()))
        .catch(callback);
    };
    const claims = await new Promise<KeycloakClaims>((resolve, reject) => {
      jwt.verify(
        token,
        getKey,
        { algorithms: ["RS256"], issuer },
        (error, decoded) => {
          if (error || !decoded || typeof decoded === "string")
            return reject(error || new Error("Invalid Keycloak token."));
          resolve(decoded as KeycloakClaims);
        },
      );
    });
    const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audience.includes(clientId) && claims.azp !== clientId)
      throw new UnauthorizedException(
        "Keycloak token is not issued for this client.",
      );
    const requiredGroup = settings.requiredGroup;
    if (requiredGroup && !claims.groups?.includes(requiredGroup))
      throw new UnauthorizedException("Keycloak group membership is required.");
    return claims;
  }

  private parseSafeUrl(value: string, label: string): URL {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new BadRequestException(`${label} must be a valid absolute URL.`);
    }
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      url.hostname.toLowerCase(),
    );
    if (
      (url.protocol !== "https:" && url.protocol !== "http:") ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (url.protocol === "http:" && !loopback)
    ) {
      throw new BadRequestException(
        `${label} must use HTTPS and cannot include credentials, a query, or a fragment (HTTP is allowed only on loopback).`,
      );
    }
    return url;
  }
}
