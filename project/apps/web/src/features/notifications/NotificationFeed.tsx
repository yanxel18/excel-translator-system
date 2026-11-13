import { useEffect, useRef } from "react";
import {
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import type { JobNotification } from "../../api";
import NotificationIcon from "./NotificationIcon";
import { useLocale } from "../shared/LocaleProvider";
import "./notifications.css";

export default function NotificationFeed({
  items,
  cursor,
  loading,
  error,
  onLoad,
  onSelect,
  selectedId,
  compact = false,
  emptyMessage,
  loadOnScroll = true,
  showLoadOlder = true,
}: {
  items: JobNotification[];
  cursor: string | null;
  loading: boolean;
  error: string;
  onLoad: () => void;
  onSelect: (item: JobNotification) => void;
  selectedId?: string;
  compact?: boolean;
  emptyMessage?: string;
  loadOnScroll?: boolean;
  showLoadOlder?: boolean;
}) {
  const { t, locale } = useLocale();
  const sentinel = useRef<HTMLDivElement>(null);
  const selected = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const element = sentinel.current;
    if (!loadOnScroll || !element || !cursor || loading || error) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onLoad();
      },
      { rootMargin: "80px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [cursor, loading, error, onLoad, loadOnScroll]);
  const found = items.some((item) => item.id === selectedId);
  useEffect(() => {
    if (found) {
      selected.current?.scrollIntoView({ block: "center", behavior: "auto" });
      selected.current?.focus({ preventScroll: true });
    }
  }, [found, selectedId]);
  const timeLabel = (date: string) => {
    const minutes = Math.round((Date.parse(date) - Date.now()) / 60000);
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (Math.abs(hours) < 24) return formatter.format(hours, "hour");
    return formatter.format(Math.round(hours / 24), "day");
  };
  const label = (date: string) => {
    const current = new Date();
    current.setHours(0, 0, 0, 0);
    const value = new Date(date);
    value.setHours(0, 0, 0, 0);
    const difference = Math.round(
      (current.getTime() - value.getTime()) / 86400000,
    );
    return difference === 0
      ? t("Today")
      : difference === 1
        ? t("Yesterday")
        : new Date(date).toLocaleDateString(locale, {
            month: "short",
            day: "numeric",
          });
  };
  return (
    <Stack
      gap="sm"
      className={`notification-feed${compact ? " notification-feed-compact" : ""}`}
    >
      {items.map((item, index) => (
        <Box key={item.id}>
          {(index === 0 ||
            label(item.createdAt) !== label(items[index - 1].createdAt)) && (
            <Text
              size="xs"
              c="dimmed"
              tt="uppercase"
              fw={600}
              mb="sm"
              mt={index ? "md" : 0}
            >
              {label(item.createdAt)}
            </Text>
          )}
          <UnstyledButton
            ref={item.id === selectedId ? selected : undefined}
            className={`notification-card${!item.isRead ? " notification-unread" : ""}${item.id === selectedId ? " notification-selected" : ""}`}
            onClick={() => onSelect(item)}
            aria-current={item.id === selectedId ? "true" : undefined}
          >
            <Group
              align="start"
              gap="sm"
              wrap="nowrap"
              className="notification-card-layout"
            >
              <NotificationIcon item={item} />
              <Box className="notification-card-content">
                <div className="notification-card-heading">
                  <Text
                    size="sm"
                    fw={650}
                    className="notification-title"
                    title={item.title}
                  >
                    {item.title}
                  </Text>
                  <Text size="xs" c="dimmed" className="notification-time">
                    {timeLabel(item.createdAt)}
                  </Text>
                </div>
                <Text
                  size="xs"
                  c="dimmed"
                  mt={4}
                  className="notification-message"
                >
                  {item.message}
                </Text>
                {!item.isRead && (
                  <Badge size="xs" variant="light" mt={6}>
                    {t("New")}
                  </Badge>
                )}
              </Box>
            </Group>
          </UnstyledButton>
        </Box>
      ))}
      {!items.length && !loading && !error && (
        <Text size="sm" c="dimmed" py="md">
          {emptyMessage ?? t("No notifications yet.")}
        </Text>
      )}
      {error && (
        <Group>
          <Text c="red" size="sm" role="alert">
            {error}
          </Text>
          <Button variant="subtle" size="xs" onClick={onLoad}>
            {t("Retry")}
          </Button>
        </Group>
      )}
      {loadOnScroll && <div ref={sentinel} aria-hidden="true" />}
      {loading && (
        <Group
          justify="center"
          py="sm"
          role="status"
          aria-label={t("Loading notifications")}
        >
          <Loader size="sm" />
        </Group>
      )}
      {showLoadOlder && cursor && !loading && (
        <Button variant="subtle" size="xs" onClick={onLoad}>
          {t("Load older notifications")}
        </Button>
      )}
    </Stack>
  );
}
