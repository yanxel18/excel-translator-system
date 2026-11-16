import {
  Badge,
  Button,
  Group,
  ScrollArea,
  SegmentedControl,
  Text,
} from "@mantine/core";
import { useState } from "react";
import { useNotificationFeed } from "./useNotificationFeed";
import NotificationFeed from "./NotificationFeed";
import { useLocale } from "../shared/LocaleProvider";
export default function NotificationPreview({
  token,
  unreadCount,
  onOpen,
}: {
  token: string;
  unreadCount: number;
  onOpen: (id?: string) => void;
}) {
  const { t } = useLocale();
  const feed = useNotificationFeed(token);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const visibleItems = feed.items.filter(
    (item) => filter !== "unread" || !item.isRead,
  );
  return (
    <div className="notification-preview">
      <Group
        justify="space-between"
        gap="xs"
        className="notification-preview-header"
      >
        <Group gap="xs" wrap="nowrap">
          <Text fw={700} size="md">
            {t("Notifications")}
          </Text>
          <Badge size="sm" className="notification-unread-count">
            {unreadCount}
          </Badge>
        </Group>
        <Button
          variant="subtle"
          size="compact-xs"
          loading={feed.markingAll}
          disabled={!unreadCount}
          onClick={() => void feed.markAllRead()}
        >
          {t("Mark all as read")}
        </Button>
      </Group>
      <Group justify="space-between" gap="xs" className="notification-filters">
        <SegmentedControl
          size="xs"
          radius="xl"
          value={filter}
          onChange={(value) => setFilter(value as "all" | "unread")}
          data={[
            { label: t("All"), value: "all" },
            { label: `${t("Unread")} ${unreadCount}`, value: "unread" },
          ]}
          aria-label={t("Filter notifications")}
        />
        <Text size="xs" c="dimmed">
          {visibleItems.length}
        </Text>
      </Group>
      <ScrollArea.Autosize mah={200} className="notification-preview-scroll">
        <NotificationFeed
          {...feed}
          items={visibleItems}
          compact
          emptyMessage={
            filter === "unread"
              ? t("No unread notifications.")
              : t("No notifications yet.")
          }
          onLoad={() => {
            void feed.load(feed.cursor ?? undefined);
          }}
          onSelect={(item) => {
            if (!item.isRead) void feed.markRead(item.id);
            onOpen(item.id);
          }}
        />
      </ScrollArea.Autosize>
      <Button
        fullWidth
        variant="subtle"
        className="notification-preview-footer"
        onClick={() => onOpen()}
      >
        {t("View all notifications")}
      </Button>
    </div>
  );
}
