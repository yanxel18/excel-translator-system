import { NavLink, Text, Box } from "@mantine/core";
import { BookOpen, History, LayoutDashboard } from "lucide-react";
import type { View } from "./types";
import { useLocale } from "../shared/LocaleProvider";

const items = [
  { view: "workspace", label: "Workspace", icon: LayoutDashboard },
  { view: "history", label: "History", icon: History },
  { view: "vocabulary", label: "Vocabulary", icon: BookOpen },
] as const;
export default function AppNavigation({
  view,
  onNavigate,
}: {
  view: View;
  onNavigate: (view: View) => void;
}) {
  const { t } = useLocale();
  return (
    <Box className="navigation-menu">
      <Text
        className="rail-caption"
        size="xs"
        fw={700}
        c="dimmed"
        tt="uppercase"
        px="sm"
        py="md"
      >
        {t("Workspace")}
      </Text>
      {items.map(({ view: destination, label, icon: Icon }) => (
        <NavLink
          key={destination}
          aria-label={t(label)}
          component="button"
          type="button"
          active={view === destination}
          aria-current={view === destination ? "page" : undefined}
          label={t(label)}
          leftSection={<Icon size={19} />}
          onClick={() => onNavigate(destination)}
        />
      ))}
      <Box className="nav-note">
        <Text fw={700} size="sm">
          Excel Translator
        </Text>
        <Text size="xs" mt={4}>
          {t("Your workbook translation workspace")}
        </Text>
      </Box>
    </Box>
  );
}
