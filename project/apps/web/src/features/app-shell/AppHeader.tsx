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
import ApiService from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import NotificationPreview from "../notifications/NotificationPreview";
import {
  hasActiveRequests,
  subscribeToRequests,
} from "../../api/request-progress";

export default function AppHeader({
  token,
  navigationOpen,
  onToggleNavigation,
  onOpenNotifications,
  onHome,
}: {
  token: string;
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
  const [unreadCount, setUnreadCount] = useState(0);
  useEffect(() => {
    if (!requestsActive) {
      setShowProgress(false);
      return;
    }
    const timer = window.setTimeout(() => setShowProgress(true), 180);
    return () => window.clearTimeout(timer);
  }, [requestsActive]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void ApiService.getUnreadNotificationCount(token)
        .then((value) => {
          if (active) setUnreadCount(value.count);
        })
        .catch(() => {});
    };
    refresh();
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("notifications-updated", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("notifications-updated", refresh);
    };
  }, [token]);
  return (
    <>
      <Group h="100%" px="lg" justify="space-between">
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
          <UnstyledButton onClick={onHome} aria-label={t("Home")}>
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
            width={420}
            shadow="xl"
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
                  onClick={() => setOpened(!opened)}
                >
                  <Bell size={19} />
                </ActionIcon>
              </Indicator>
            </Popover.Target>
            <Popover.Dropdown className="notification-popover">
              {opened && (
                <NotificationPreview
                  token={token}
                  unreadCount={unreadCount}
                  onOpen={(id) => {
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
