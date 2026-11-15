import { NavLink, Text, Box } from "@mantine/core";
import { BookOpen, History, LayoutDashboard, Settings, Volume2 } from "lucide-react";
import type { View } from "./types";
import { useLocale } from "../shared/LocaleProvider";

const items = [
  { view: "workspace", label: "Translate File", icon: LayoutDashboard },
  { view: "history", label: "History", icon: History },
  { view: "vocabulary", label: "Vocabulary", icon: BookOpen },
  { view: "changelog", label: "Changelog", icon: Volume2 },
  { view: "settings/users", label: "System Settings", icon: Settings, adminOnly: true },
] as const;
export default function AppNavigation({
  view,
  isAdmin,
  onNavigate,
}: {
  view: View;
  isAdmin: boolean;
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
      {items.filter((item) => !("adminOnly" in item) || isAdmin).map(({ view: destination, label, icon: Icon }) => {
        const active = destination === "settings/users" ? view.startsWith("settings/") : view === destination;
        return (
          <NavLink
            key={destination}
            aria-label={t(label)}
            component="button"
            type="button"
            active={active}
            aria-current={active ? "page" : undefined}
            label={t(label)}
            leftSection={<Icon size={19} aria-hidden="true" />}
            onClick={() => onNavigate(destination)}
          />
        );
      })}
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
