type LocalParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

export type LocalTimeResult =
  | { kind: "valid"; iso: string }
  | { kind: "empty" | "invalid" | "ambiguous" | "nonexistent" };

function partsAt(instant: number, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value]),
  );
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function pseudoUtc(parts: LocalParts): number {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, 0, 0);
  return date.getTime();
}

function sameParts(left: LocalParts, right: LocalParts): boolean {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute
  );
}

export function localDateTimeToUtc(
  value: string,
  timeZone: string,
): LocalTimeResult {
  if (!value) return { kind: "empty" };
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return { kind: "invalid" };
  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const requested: LocalParts = {
    year: Number(yearText),
    month: Number(monthText),
    day: Number(dayText),
    hour: Number(hourText),
    minute: Number(minuteText),
  };
  if (
    requested.year < 1 ||
    requested.year > 9999 ||
    requested.month < 1 ||
    requested.month > 12 ||
    requested.day < 1 ||
    requested.hour > 23 ||
    requested.minute > 59
  )
    return { kind: "invalid" };

  const localAsUtc = pseudoUtc(requested);
  const normalized = new Date(localAsUtc);
  if (
    normalized.getUTCFullYear() !== requested.year ||
    normalized.getUTCMonth() + 1 !== requested.month ||
    normalized.getUTCDate() !== requested.day
  )
    return { kind: "invalid" };

  const offsets = new Set<number>();
  const halfWindow = 48 * 60 * 60 * 1000;
  const sampleStep = 6 * 60 * 60 * 1000;
  for (
    let sample = localAsUtc - halfWindow;
    sample <= localAsUtc + halfWindow;
    sample += sampleStep
  ) {
    offsets.add(pseudoUtc(partsAt(sample, timeZone)) - sample);
  }

  const instants = [...offsets]
    .map((offset) => localAsUtc - offset)
    .filter((instant) => sameParts(partsAt(instant, timeZone), requested));
  if (instants.length === 0) return { kind: "nonexistent" };
  if (instants.length > 1) return { kind: "ambiguous" };
  return { kind: "valid", iso: new Date(instants[0]).toISOString() };
}

export function instantToLocalDateTime(
  value: string | null,
  timeZone: string,
): string {
  if (!value) return "";
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return "";
  const { year, month, day, hour, minute } = partsAt(instant, timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function formatInstant(
  value: string,
  locale: string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(new Date(value));
}
