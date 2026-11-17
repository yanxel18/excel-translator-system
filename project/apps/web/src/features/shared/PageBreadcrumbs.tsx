import { Anchor, Breadcrumbs, Text } from "@mantine/core";
import { ChevronRight } from "lucide-react";
import { useLocale } from "./LocaleProvider";

export default function PageBreadcrumbs({
  items,
}: {
  items: { label: string; href?: string }[];
}) {
  const { t } = useLocale();
  return (
    <nav aria-label={t("Breadcrumb")}>
      <Breadcrumbs separator={<ChevronRight size={14} aria-hidden="true" />} style={{ flexWrap: "wrap" }}>
        {items.map(({ label, href }, index) =>
          href ? (
            <Anchor key={index} href={href} size="sm" c="dimmed" underline="hover">
              {label}
            </Anchor>
          ) : (
            <Text key={index} size="sm" aria-current={index === items.length - 1 ? "page" : undefined}>
              {label}
            </Text>
          ),
        )}
      </Breadcrumbs>
    </nav>
  );
}
