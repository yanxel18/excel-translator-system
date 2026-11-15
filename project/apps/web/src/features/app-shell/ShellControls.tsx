import {
  ActionIcon,
  Avatar,
  Button,
  Menu,
  Text,
  UnstyledButton,
  useMantineColorScheme,
} from "@mantine/core";
import {
  Check,
  ChevronUp,
  ChevronDown,
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
import GidIdenticon from "../shared/GidIdenticon";
import { LOCALE_OPTIONS } from "../shared/locale";
import type { View } from "./types";

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
  const accountEmail = profileLoadError
    ? t("Could not load profile.")
    : profileLoading
      ? t("Loading profile…")
      : email;
  const identiconSeed =
    profile?.gid?.trim() || profile?.username || profile?.id || "account";

  return (
    <div className="shell-profile-controls">
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
                className="shell-gid-identicon"
                size={48}
                radius="md"
                p={3}
                aria-hidden="true"
              >
                <GidIdenticon seed={identiconSeed} />
              </Avatar>
              <span className="shell-account-copy">
                <Text className="shell-account-name" size="sm" fw={600}>
                  {displayName}
                </Text>
                <Text className="shell-account-email" size="xs" c="dimmed">
                  {accountEmail}
                </Text>
              </span>
              <ChevronUp
                className="shell-account-chevron"
                size={14}
                aria-hidden="true"
              />
            </UnstyledButton>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label className="shell-account-details">
              <Text className="shell-account-name" size="sm" fw={600}>
                {displayName}
              </Text>
              {!profileLoadError && !profileLoading && (
                <Text className="shell-account-email" size="xs" c="dimmed">
                  {email}
                </Text>
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
        <span
          id="shell-account-status"
          className="shell-visually-hidden"
          role={profileLoadError ? "alert" : undefined}
        >
          {displayName}, {accountEmail}
        </span>
      </div>
      <div className="shell-profile-actions">
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
        <LanguageControl />
      </div>
    </div>
  );
}

export function LanguageControl() {
  const { locale, setLocale, t } = useLocale();
  const [languageMenuOpen, setLanguageMenuOpen] = useState(false);
  const selectedLanguage =
    LOCALE_OPTIONS.find((option) => option.value === locale)?.label ?? locale;
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
          <Button
            className="shell-language-button"
            variant="default"
            size="sm"
            leftSection={<Globe2 size={17} aria-hidden="true" />}
            rightSection={<ChevronDown size={14} aria-hidden="true" />}
            aria-label={t("Change language")}
            title={t("Language")}
          >
            {selectedLanguage}
          </Button>
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
