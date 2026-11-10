import { Language } from '../../generated/prisma/client';

export const SUPPORTED_LANGUAGES = Object.values(Language) as Language[];

export const SUPPORTED_LANGUAGE_PAIRS = SUPPORTED_LANGUAGES.flatMap((source) =>
  SUPPORTED_LANGUAGES.filter((target) => target !== source).map((target) => [source, target] as const),
);

export function isSupportedLanguagePair(source: unknown, target: unknown): source is Language {
  return SUPPORTED_LANGUAGE_PAIRS.some(([supportedSource, supportedTarget]) =>
    supportedSource === source && supportedTarget === target,
  );
}
