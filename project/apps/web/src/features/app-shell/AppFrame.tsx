import { useEffect, useState, type ReactNode } from "react";
import { AppShell, Box } from "@mantine/core";
import type { View } from "./types";
import AppHeader from "./AppHeader";
import AppNavigation from "./AppNavigation";
import MaintenanceNotice from "./MaintenanceNotice";
import { AccountControls } from "./ShellControls";
import ApiService from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import type { UserProfile } from "../../api";

const footerCompany = import.meta.env.VITE_FOOTER_COMPANY?.trim() || "Rimuru Company";

export default function AppFrame({
  isAdmin,
  view,
  onNavigate,
  onSignOut,
  mobileOpen,
  onToggleMobile,
  onCloseMobile,
  children,
  token,
  unreadCount,
  onOpenNotification,
  profile,
  profileLoading,
  profileLoadError,
}: {
  isAdmin: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  profileLoadError: boolean;
  onOpenNotification: (id?: string) => void;
  token: string;
  unreadCount: number;
  view: View;
  onNavigate: (view: View) => void;
  onSignOut: () => void;
  mobileOpen: boolean;
  onToggleMobile: () => void;
  onCloseMobile: () => void;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const [year, setYear] = useState<number | null>(null);
  const [yearUnavailable, setYearUnavailable] = useState(false);

  useEffect(() => {
    let active = true;
    const loadSystemYear = async () => {
      try {
        const info = await ApiService.getSystemInfo();
        if (active) {
          setYear(info.year);
          setYearUnavailable(false);
        }
      } catch {
        if (active) setYearUnavailable(true);
      }
    };

    void loadSystemYear();
    const interval = window.setInterval(() => void loadSystemYear(), 300_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  return (
    <AppShell
      data-mobile-navigation={mobileOpen ? "open" : "closed"}
      header={{ height: 68 }}
      navbar={{
        width: 232,
        breakpoint: "sm",
        collapsed: { mobile: !mobileOpen },
      }}
      padding="md"
    >
      <AppShell.Header className="app-header">
        <AppHeader
          onHome={() => {
            onNavigate("workspace");
            onCloseMobile();
          }}
          token={token}
          unreadCount={unreadCount}
          navigationOpen={mobileOpen}
          onToggleNavigation={onToggleMobile}
          onOpenNotifications={(id) => {
            onOpenNotification(id);
            onCloseMobile();
          }}
        />
      </AppShell.Header>
      <AppShell.Navbar id="app-navigation" p="xs" className="navigation-rail">
        <AppNavigation
          view={view}
          isAdmin={isAdmin}
          onNavigate={(destination) => {
            onNavigate(destination);
            onCloseMobile();
          }}
        />
        <AccountControls
          profile={profile}
          profileLoading={profileLoading}
          profileLoadError={profileLoadError}
          onNavigate={(destination) => {
            onNavigate(destination);
            onCloseMobile();
          }}
          onSignOut={onSignOut}
        />
      </AppShell.Navbar>
      <AppShell.Main>
        <Box className="main-content">
          <MaintenanceNotice token={token} />
          {children}
        </Box>
        <footer className="app-footer" role="contentinfo">
          {t("Translation System")} {footerCompany} ©{" "}
          {year ?? (yearUnavailable ? t("Year unavailable") : "…")}
        </footer>
      </AppShell.Main>
    </AppShell>
  );
}
