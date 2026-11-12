import { Badge, Group } from "@mantine/core";
import type { Language } from "../../api";
import { languageName } from "./language-options";

const flags: Record<Language, string> = {
  JAPANESE: "🇯🇵",
  ENGLISH: "🇺🇸",
  CHINESE: "🇨🇳",
};

export default function LanguagePair({
  source,
  target,
}: {
  source: Language;
  target: Language;
}) {
  return (
    <Group
      gap={6}
      wrap="nowrap"
      aria-label={`${languageName(source)} to ${languageName(target)}`}
    >
      <Badge
        variant="light"
        color="gray"
        leftSection={<span aria-hidden="true">{flags[source]}</span>}
      >
        {languageName(source)}
      </Badge>
      <span aria-hidden="true" style={{ color: "var(--mantine-color-dimmed)" }}>
        →
      </span>
      <Badge
        variant="light"
        color="blue"
        leftSection={<span aria-hidden="true">{flags[target]}</span>}
      >
        {languageName(target)}
      </Badge>
    </Group>
  );
}
