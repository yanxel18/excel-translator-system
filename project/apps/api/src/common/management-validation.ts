import { BadRequestException } from "@nestjs/common";

/** Validate untrusted management input before reading individual fields. */
export function strictObject(
  value: unknown,
  allowed: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new BadRequestException("Expected an object.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !allowed.includes(key)))
    throw new BadRequestException("Unexpected field.");
  return input;
}

export function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
  trim = true,
): string {
  if (typeof value !== "string")
    throw new BadRequestException(`${label} must be text.`);
  const result = trim ? value.trim() : value;
  if (!result.trim() || result.length > maxLength)
    throw new BadRequestException(
      `${label} must contain 1 to ${maxLength} characters.`,
    );
  return result;
}

/** Validates nullable/optional display text while preserving Unicode, including CJK. */
export function nullableText(
  value: unknown,
  label: string,
  maxLength: number,
): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  if (typeof value !== "string")
    throw new BadRequestException(`${label} must be text.`);
  const result = value.trim();
  if (result.length > maxLength)
    throw new BadRequestException(
      `${label} must be ${maxLength} characters or fewer.`,
    );
  return result || null;
}

export function requiredEmail(value: unknown): string {
  const email = requiredText(value, "Email", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new BadRequestException("Enter a valid email address.");
  return email;
}

/** Profile email accepts explicit null to clear the field, but never silently normalizes invalid input. */
export function nullableEmail(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value as null | undefined;
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ) {
    throw new BadRequestException("Enter a valid email address.");
  }
  return value.trim().toLowerCase();
}

export function uuid(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new BadRequestException("Invalid ID.");
  return value;
}

export function pageNumber(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
    throw new BadRequestException("Invalid page.");
  const page = Number(value);
  if (!Number.isSafeInteger(page) || page > maximum)
    throw new BadRequestException("Invalid page.");
  return page;
}

/** Shared list page-size contract for management queries. */
export function pageSize(value: unknown, fallback = 10): number {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    !["10", "20", "30", "40", "50"].includes(value)
  ) {
    throw new BadRequestException("Invalid page size.");
  }
  return Number(value);
}

export function choice<T extends string>(
  value: unknown,
  allowed: readonly T[],
  label: string,
): T {
  if (typeof value !== "string" || !allowed.includes(value as T))
    throw new BadRequestException(`Invalid ${label}.`);
  return value as T;
}
