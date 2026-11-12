import { ThemeIcon } from "@mantine/core";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  CircleAlert,
  Clock3,
} from "lucide-react";
import type { JobNotification } from "../../api";

export default function NotificationIcon({ item }: { item: JobNotification }) {
  const type = item.type.toUpperCase();
  const failed = type.includes("FAIL") || type.includes("ERROR");
  const warning = type.includes("CANCEL") || type.includes("WARN");
  const done = type.includes("COMPLETE");
  const Icon = failed
    ? CircleAlert
    : warning
      ? AlertTriangle
      : done
        ? CheckCircle2
        : type.includes("PROGRESS")
          ? Clock3
          : Bell;
  return (
    <ThemeIcon
      radius="xl"
      size={44}
      variant="light"
      color={failed ? "red" : warning ? "orange" : done ? "teal" : "blue"}
      aria-hidden="true"
    >
      <Icon size={22} strokeWidth={1.8} />
    </ThemeIcon>
  );
}
