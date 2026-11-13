import {
  ActionIcon,
  Avatar,
  Menu,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import {
  Check,
  ChevronUp,
  Globe2,
  LogOut,
  Moon,
  Settings,
  Sun,
  UserRound,
  Volume2,
} from "lucide-react";
import { useState } from "react";
import type { UserProfile } from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import { LOCALE_OPTIONS } from "../shared/locale";
import type { View } from "./types";

function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1)
    return `${Array.from(words[0])[0]}${Array.from(words[words.length - 1])[0]}`.toUpperCase();
  return Array.from(name.trim()).slice(0, 2).join("").toUpperCase();
}

export function AccountControls({
  isAdmin,
  profile,
  profileLoading,
  profileLoadError,
  onNavigate,
  onSignOut,
}: {
  isAdmin: boolean;
  profile: UserProfile | null;
  profileLoading: boolean;
  profileLoadError: boolean;
  onNavigate: (view: View) => void;
  onSignOut: () => void;
}) {
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const { t } = useLocale();
  const displayName = profileLoadError
    ? t("Profile unavailable")
    : profile?.fullName?.trim() ||
      profile?.username?.trim() ||
      (profileLoading ? t("Loading profile…") : t("Account"));
  const email = profile?.email?.trim() || t("Email not provided");
  const initials = initialsFor(
    profile?.fullName?.trim() || profile?.username?.trim() || "",
  );

  return (
    <div className="shell-profile-controls">
        <ActionIcon
          variant="subtle"
          color="blue"
          size="lg"
          aria-label={t("Toggle color theme")}
          aria-pressed={colorScheme === "dark"}
          title={t(colorScheme === "dark" ? "Use light theme" : "Use dark theme")}
          onClick={() => toggleColorScheme()}
        >
          {colorScheme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
        </ActionIcon>
        <div className="shell-account-wrap">
          <Menu position="top-start" width={240} shadow="lg" withinPortal>
            <Menu.Target>
              <UnstyledButton
                className="shell-account-trigger"
                aria-label={t("Account")}
                aria-describedby="shell-account-status"
                aria-busy={profileLoading}
              >
                <Avatar
                  size={38}
                  radius="xl"
                  color="blue"
                  aria-hidden="true"
                >
                  {initials || <UserRound size={18} />}
                </Avatar>
                <ChevronUp className="shell-account-chevron" size={14} aria-hidden="true" />
              </UnstyledButton>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label className="shell-account-details">
                <Text className="shell-account-name" size="sm" fw={600}>{displayName}</Text>
                {!profileLoadError && !profileLoading && (
                  <Text className="shell-account-email" size="xs" c="dimmed">{email}</Text>
                )}
                {profileLoadError && (
                  <Text className="shell-account-error" size="xs" c="red">
                    {t("Could not load profile.")}
                  </Text>
                )}
              </Menu.Label>
              <Menu.Item
                leftSection={<UserRound size={16} />}
                onClick={() => onNavigate("profile")}
              >
                {t("Profile")}
              </Menu.Item>
              {isAdmin && (
                <Menu.Item
                  leftSection={<Settings size={16} />}
                  onClick={() => onNavigate("settings/users")}
                >
                  {t("System Settings")}
                </Menu.Item>
              )}
              <Menu.Item
                leftSection={<Volume2 size={16} />}
                onClick={() => onNavigate("changelog")}
              >
                {t("Changelog")}
              </Menu.Item>
              <Menu.Divider />
              <Menu.Item
                color="red"
                leftSection={<LogOut size={16} />}
                onClick={onSignOut}
              >
                {t("Sign out")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
          <span id="shell-account-status" className="shell-visually-hidden" role={profileLoadError ? "alert" : undefined}>
            {displayName}{profileLoadError ? ` ${t("Could not load profile.")}` : ""}
          </span>
        </div>
    </div>
  );
}

export function LanguageControl() {
  const { locale, setLocale, t } = useLocale();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  return (
      <div className="shell-language-control">
        <Menu
          opened={languageMenuOpen}
          onChange={setLanguageMenuOpen}
          position="top-end"
          shadow="lg"
          withinPortal
        >
          <Menu.Target>
            <ActionIcon
              className="shell-language-button"
              variant="light"
              color="blue"
              size="lg"
              aria-label={t("Change language")}
              title={t("Language")}
            >
              <Globe2 size={19} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {LOCALE_OPTIONS.map(({ value, label }) => (
              <Menu.Item
                key={value}
                rightSection={locale === value ? <Check size={16} /> : null}
                onClick={() => {
                  if (value !== "en" && value !== "ja" && value !== "zh") return;
                  setLocale(value);
                  setLanguageMenuOpen(false);
                }}
              >
                {label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </div>
  );
}
