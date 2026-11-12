import type { OidcAdminSettings, OidcPublicConfig } from "../../api";

// Mirror V2-14's input constraints for feedback, not as an authorization boundary.
export function safeProviderUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
      url.hostname.toLowerCase(),
    );
    return url.hostname &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      (url.protocol === "https:" || (url.protocol === "http:" && loopback))
      ? url
      : null;
  } catch {
    return null;
  }
}

export function validPublicConfig(config: OidcPublicConfig): boolean {
  if (
    !config ||
    !["LOCAL", "OIDC", "HYBRID"].includes(config.mode) ||
    config.enabled !== (config.mode !== "LOCAL") ||
    ![config.url, config.realm, config.clientId].every(
      (value) => typeof value === "string",
    )
  )
    return false;
  return (
    config.mode === "LOCAL" ||
    (typeof config.url === "string" &&
      config.url.length <= 2048 &&
      !!safeProviderUrl(config.url) &&
      typeof config.realm === "string" &&
      config.realm.length > 0 &&
      config.realm.length <= 128 &&
      !/[\u0000-\u0020/\\?#]/.test(config.realm) &&
      typeof config.clientId === "string" &&
      !!config.clientId.trim() &&
      config.clientId.length <= 256)
  );
}

export function validateOidcSettings(
  settings: OidcAdminSettings,
): Partial<Record<keyof OidcAdminSettings, string>> {
  const errors: Partial<Record<keyof OidcAdminSettings, string>> = {};
  const enabled = settings.mode !== "LOCAL";
  for (const [field, length] of [
    ["keycloakUrl", 2048],
    ["realm", 128],
    ["clientId", 256],
    ["issuerUrl", 2048],
    ["requiredGroup", 512],
  ] as const) {
    if (settings[field].length > length)
      errors[field] = "The value exceeds the allowed length.";
  }
  for (const field of [
    "keycloakUrl",
    "realm",
    "clientId",
    "issuerUrl",
  ] as const) {
    if (enabled && !settings[field].trim())
      errors[field] = "This field is required for provider sign-in.";
  }
  const provider = safeProviderUrl(
    settings.keycloakUrl.trim().replace(/\/+$/, ""),
  );
  const issuer = safeProviderUrl(settings.issuerUrl.trim().replace(/\/+$/, ""));
  for (const [field, url] of [
    ["keycloakUrl", provider],
    ["issuerUrl", issuer],
  ] as const) {
    if (settings[field].trim() && !url)
      errors[field] =
        "Use HTTPS without credentials, query or fragment. HTTP is allowed only on loopback.";
  }
  if (
    settings.realm.trim() &&
    /[\u0000-\u0020/\\?#]/.test(settings.realm.trim())
  ) {
    errors.realm = "Realm must be a single path segment.";
  }
  if (
    enabled &&
    provider &&
    issuer &&
    (issuer.origin !== provider.origin ||
      issuer.pathname !==
        `${provider.pathname.replace(/\/+$/, "")}/realms/${encodeURIComponent(settings.realm.trim())}`)
  ) {
    errors.issuerUrl =
      "Issuer URL must match the configured Keycloak URL and realm.";
  }
  return errors;
}
