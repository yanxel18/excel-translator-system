export function allowsConfiguredUserBootstrap(
  nodeEnvironment = process.env.NODE_ENV,
  enabled = process.env.AUTH_BOOTSTRAP_ENABLED,
): boolean {
  return enabled === 'true' || nodeEnvironment !== 'production';
}
