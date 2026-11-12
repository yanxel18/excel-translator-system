// Mirrors tasks/plan-v2.md; the API remains authoritative for uniqueness and Base existence.
export const fieldLimits = {
  gid: 64,
  username: 100,
  email: 254,
  code: 32,
  name: 100,
  password: 128,
} as const;
export type ManagementField = keyof typeof fieldLimits;
export const passwordMinLength = 12;

export function validateManagementField(
  field: ManagementField,
  value: string,
): string | undefined {
  // Do not trim, normalize, or strip any part of a password.
  if (field === "password") {
    return value.length < passwordMinLength ||
      value.length > fieldLimits.password
      ? "Password must contain 12 to 128 characters."
      : undefined;
  }
  if (field === "gid" && /[\u0000-\u001f\u007f-\u009f]/.test(value))
    return "GID cannot contain control characters.";
  const text = value.trim();
  if (!text || text.length > fieldLimits[field])
    return `Enter 1 to ${fieldLimits[field]} characters.`;
  if (field === "code" && !/^[A-Za-z0-9_-]+$/.test(text))
    return "Use ASCII letters, digits, underscore or hyphen.";
  if (field === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text))
    return "Enter a valid email address.";
  return undefined;
}
