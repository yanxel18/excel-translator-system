import {
  ActionIcon,
  Box,
  Burger,
  Group,
  Indicator,
  Popover,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import { useLocale } from "../shared/LocaleProvider";
import NotificationPreview from "../notifications/NotificationPreview";
import {
  hasActiveRequests,
  subscribeToRequests,
} from "../../api/request-progress";

export default function AppHeader({
  token,
  unreadCount,
  navigationOpen,
  onToggleNavigation,
  onOpenNotifications,
  onHome,
}: {
  token: string;
  unreadCount: number;
  navigationOpen: boolean;
  onToggleNavigation: () => void;
  onOpenNotifications: (id?: string) => void;
  onHome: () => void;
}) {
  const { t } = useLocale();
  const requestsActive = useSyncExternalStore(
    subscribeToRequests,
    hasActiveRequests,
    () => false,
  );
  const [showProgress, setShowProgress] = useState(false);
  const [opened, setOpened] = useState(false);
  const [restoreFocus, setRestoreFocus] = useState(true);
  useEffect(() => {
    if (!requestsActive) {
      setShowProgress(false);
      return;
    }
    const timer = window.setTimeout(() => setShowProgress(true), 180);
    return () => window.clearTimeout(timer);
  }, [requestsActive]);
  return (
    <>
      <Group h="100%" px="lg" justify="space-between" className="app-header-content">
        <Group gap="sm">
          <Burger
            hiddenFrom="sm"
            opened={navigationOpen}
            onClick={onToggleNavigation}
            aria-label={t("Toggle navigation")}
            aria-expanded={navigationOpen}
            aria-controls="app-navigation"
            size="sm"
          />
          <UnstyledButton onClick={onHome} aria-label={t("Home")} className="app-home-button">
            <Group gap="sm">
              <img
                className="app-brand-mark"
                src={`${import.meta.env.BASE_URL}assets/excel-translator-mark.svg`}
                alt=""
                aria-hidden="true"
                width={38}
                height={38}
              />
              <Box>
                <Text fw={800}>Excel Translator</Text>
                <Text size="xs" c="dimmed">
                  {t("Workbook translation")}
                </Text>
              </Box>
            </Group>
          </UnstyledButton>
        </Group>
        <Group gap="xs">
          <Popover
            opened={opened}
            onChange={setOpened}
            position="bottom-end"
            width={344}
            shadow="md"
            trapFocus
            returnFocus={restoreFocus}
            withinPortal
          >
            <Popover.Target>
              <Indicator
                label={unreadCount > 99 ? "99+" : unreadCount}
                disabled={!unreadCount}
                size={20}
                color="red"
              >
                <ActionIcon
                  variant="light"
                  color="blue"
                  size="lg"
                  aria-label={t("Open notifications")}
                  aria-haspopup="dialog"
                  aria-expanded={opened}
                  className="app-notification-trigger"
                  onClick={() => {
                    setRestoreFocus(true);
                    setOpened(!opened);
                  }}
                >
                  <Bell size={22} />
                </ActionIcon>
              </Indicator>
            </Popover.Target>
            <Popover.Dropdown className="notification-popover" role="dialog" aria-label={t("Notifications")}>
              {opened && (
                <NotificationPreview
                  token={token}
                  unreadCount={unreadCount}
                  onOpen={(id) => {
                    // Navigation owns destination focus; dismissal returns to the bell.
                    setRestoreFocus(false);
                    setOpened(false);
                    onOpenNotifications(id);
                  }}
                />
              )}
            </Popover.Dropdown>
          </Popover>
        </Group>
      </Group>
      {showProgress && (
        <div
          className="request-progress"
          role="progressbar"
          aria-label={t("processing")}
        >
          <span />
        </div>
      )}
    </>
  );
}
