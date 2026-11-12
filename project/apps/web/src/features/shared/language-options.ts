import { Language } from "../../api";

export const LANGUAGE_OPTIONS: { value: Language; label: string }[] = [
  { value: "JAPANESE", label: "Japanese" },
  { value: "ENGLISH", label: "English" },
  { value: "CHINESE", label: "Chinese" },
];

export function languageName(language: Language): string {
  return (
    LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ??
    language
  );
}
