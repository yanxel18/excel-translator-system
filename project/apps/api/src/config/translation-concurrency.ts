export const DEFAULT_MAX_CONCURRENT_TRANSLATIONS = 5;

export function getMaxConcurrentTranslations(
  value: string | undefined,
): number {
  if (value === undefined) return DEFAULT_MAX_CONCURRENT_TRANSLATIONS;

  if (!/^[1-5]$/.test(value))
    throw new Error(
      "MAX_CONCURRENT_TRANSLATIONS must be an integer from 1 to 5.",
    );

  return Number(value);
}
