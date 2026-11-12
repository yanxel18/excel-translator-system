import { type FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Languages,
  UserRound,
} from "lucide-react";
import {
  Alert,
  Avatar,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  RingProgress,
  SimpleGrid,
  Skeleton,
  Stack,
  Tabs,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import ApiService, { type Job, type UserProfile } from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import AdminKeycloakSettings from "./AdminKeycloakSettings";

function ProfileIdenticon({ seed }: { seed: string }) {
  let hash = 0;
  for (const character of seed)
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const cells: Array<[number, number]> = [];
  for (let y = 0; y < 5; y += 1)
    for (let x = 0; x < 3; x += 1) {
      hash ^= hash << 13;
      hash ^= hash >>> 17;
      hash ^= hash << 5;
      hash >>>= 0;
      if (hash >>> 31) {
        cells.push([x, y]);
        if (x < 2) cells.push([4 - x, y]);
      }
    }
  return (
    <svg
      viewBox="0 0 5 5"
      width="100%"
      height="100%"
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <rect width="5" height="5" fill={`hsl(${hue} 72% 94%)`} />
      {cells.map(([x, y]) => (
        <rect
          key={`${x}-${y}`}
          x={x}
          y={y}
          width="1"
          height="1"
          fill={`hsl(${hue} 58% 42%)`}
        />
      ))}
    </svg>
  );
}

export default function ProfilePage({
  token,
  search,
  onTabChange,
  onNewTranslation,
}: {
  token: string;
  search: string;
  onTabChange: (tab: "overview" | "account") => void;
  onNewTranslation: () => void;
}) {
  const { t, locale } = useLocale();
  const routeTab =
    new URLSearchParams(search).get("tab") === "account"
      ? "account"
      : "overview";
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "account">(routeTab);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [activityBusy, setActivityBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [activityError, setActivityError] = useState("");
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);

  useEffect(() => setActiveTab(routeTab), [routeTab]);

  useEffect(() => {
    let active = true;
    void ApiService.getProfile(token)
      .then((value) => {
        if (active) {
          setProfile(value);
          setFullName(value.fullName ?? "");
          setEmail(value.email ?? "");
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : t("Could not load profile."),
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [token, t]);

  useEffect(() => {
    let active = true;
    void ApiService.getJobs(token)
      .then((value) => {
        if (active) setJobs(value);
      })
      .catch((reason) => {
        if (active)
          setActivityError(
            reason instanceof Error
              ? reason.message
              : t("Could not load translation activity."),
          );
      })
      .finally(() => {
        if (active) setActivityBusy(false);
      });
    return () => {
      active = false;
    };
  }, [token, t]);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const value = await ApiService.updateProfile(
        { fullName: fullName || null, email: email || null },
        token,
      );
      setProfile(value);
      setSaved(true);
      setEditing(false);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not save profile."),
      );
    } finally {
      setSaving(false);
    }
  };

  const editProfile = () => {
    if (!profile) return;
    setFullName(profile.fullName ?? "");
    setEmail(profile.email ?? "");
    setError("");
    setSaved(false);
    setActiveTab("account");
    onTabChange("account");
    setEditing(true);
  };
  const cancelEdit = () => {
    setFullName(profile?.fullName ?? "");
    setEmail(profile?.email ?? "");
    setError("");
    setEditing(false);
  };
  const changePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    setPasswordSaved(false);
    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError(t("Password must contain 12 to 128 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("Passwords do not match."));
      return;
    }
    setPasswordSaving(true);
    try {
      await ApiService.changeOwnPassword(currentPassword, newPassword, token);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (reason) {
      setPasswordError(
        reason instanceof Error
          ? reason.message
          : t("Could not change password."),
      );
    } finally {
      setPasswordSaving(false);
    }
  };

  const displayName = profile?.fullName?.trim() || profile?.username || "";
  const identiconSeed = profile?.username || profile?.id || "account";
  const completed = jobs.filter((job) => job.status === "COMPLETED").length;
  const inProgress = jobs.filter(
    (job) => job.status === "PROCESSING" || job.status === "PENDING",
  ).length;
  const needsAttention = jobs.filter((job) => job.status === "FAILED").length;
  const activityDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date();
        date.setHours(0, 0, 0, 0);
        date.setDate(date.getDate() - (6 - index));
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        return {
          date,
          count: jobs.filter((job) => {
            const createdAt = new Date(job.createdAt);
            return createdAt >= date && createdAt < nextDate;
          }).length,
        };
      }),
    [jobs],
  );
  const maxActivity = Math.max(1, ...activityDays.map((day) => day.count));
  const statusRows = [
    { label: t("completed"), count: completed, color: "teal" },
    {
      label: t("processing"),
      count: jobs.filter((job) => job.status === "PROCESSING").length,
      color: "blue",
    },
    {
      label: t("pending"),
      count: jobs.filter((job) => job.status === "PENDING").length,
      color: "yellow",
    },
    { label: t("failed"), count: needsAttention, color: "red" },
    {
      label: t("cancelled"),
      count: jobs.filter((job) => job.status === "CANCELLED").length,
      color: "gray",
    },
  ];
  const recentJobs = [...jobs]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 5);
  const summaryCards = [
    {
      label: t("Total workbooks"),
      value: jobs.length,
      icon: FileSpreadsheet,
      color: "blue",
    },
    {
      label: t("Completed"),
      value: completed,
      icon: CheckCircle2,
      color: "teal",
    },
    {
      label: t("In progress"),
      value: inProgress,
      icon: Activity,
      color: "cyan",
    },
    {
      label: t("Needs attention"),
      value: needsAttention,
      icon: AlertTriangle,
      color: "orange",
    },
  ];

  return (
    <Stack gap="lg" className="profile-page">
      <Paper withBorder radius="lg" className="profile-hero">
        <div className="profile-cover" aria-hidden="true" />
        <Group
          className="profile-identity"
          align="end"
          justify="space-between"
          wrap="wrap"
        >
          <Group align="end" gap="md" wrap="nowrap">
            <Avatar
              className="profile-avatar"
              size={92}
              radius="50%"
              p={4}
              color="gray"
            >
              <ProfileIdenticon seed={identiconSeed} />
            </Avatar>
            <div className="profile-names">
              <Text component="h1" fw={700} size="lg">
                {busy ? t("Loading profile") : displayName}
              </Text>
              <Text size="sm" c="dimmed">
                {profile ? `@${profile.username}` : t("Account")}
              </Text>
            </div>
          </Group>
          <Group className="profile-hero-actions" gap="xs" wrap="wrap">
            {profile && (
              <Badge variant="light" color="teal" className="profile-active">
                <span className="profile-active-dot" />
                {t("Active")}
              </Badge>
            )}
            <Button
              leftSection={<Languages size={16} />}
              onClick={onNewTranslation}
            >
              {t("New translation")}
            </Button>
            {profile && !busy && (
              <>
                {editing && (
                  <Button
                    variant="default"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    {t("Cancel")}
                  </Button>
                )}
                <Button
                  variant={editing ? "filled" : "default"}
                  onClick={editing ? () => void save() : editProfile}
                  loading={saving}
                >
                  {editing ? t("Save changes") : t("Edit info")}
                </Button>
              </>
            )}
          </Group>
        </Group>
        {profile && (
          <Group className="profile-meta" gap="lg" wrap="wrap">
            <Text size="sm">
              <span className="profile-detail-label">{t("Member since")}</span>{" "}
              {new Date(profile.createdAt).toLocaleDateString(locale, {
                year: "numeric",
                month: "long",
              })}
            </Text>
            <Text size="sm">
              <span className="profile-detail-label">{t("Email")}</span>{" "}
              {profile.email || t("Not provided")}
            </Text>
          </Group>
        )}
      </Paper>
      {error && !profile && (
        <Text c="red" role="alert">
          {error}
        </Text>
      )}

      <Tabs
        value={activeTab}
        onChange={(value) => {
          if (value === "overview" || value === "account") {
            if (editing && value !== "account") cancelEdit();
            setActiveTab(value);
            onTabChange(value);
          }
        }}
        className="profile-tabs"
      >
        <Tabs.List aria-label={t("Profile sections")}>
          <Tabs.Tab value="overview" leftSection={<Activity size={15} />}>
            {t("Overview")}
          </Tabs.Tab>
          <Tabs.Tab value="account" leftSection={<UserRound size={15} />}>
            {t("Account details")}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="overview" pt="lg">
          <Stack gap="lg">
            {activityBusy ? (
              <SimpleGrid
                cols={{ base: 2, sm: 4 }}
                aria-label={t("Loading translation activity")}
                aria-busy="true"
              >
                {summaryCards.map((card) => (
                  <Skeleton key={card.label} height={104} radius="lg" />
                ))}
              </SimpleGrid>
            ) : activityError ? (
              <Text c="red" role="alert">
                {activityError}
              </Text>
            ) : (
              <>
                <SimpleGrid
                  cols={{ base: 2, sm: 4 }}
                  className="profile-summary-grid"
                >
                  {summaryCards.map(({ label, value, icon: Icon, color }) => (
                    <Paper key={label} withBorder radius="lg" p="md">
                      <Group justify="space-between" align="start" gap="xs">
                        <Text size="xs" c="dimmed" fw={600}>
                          {label}
                        </Text>
                        <ThemeIcon
                          variant="light"
                          color={color}
                          radius="md"
                          size="sm"
                        >
                          <Icon size={15} />
                        </ThemeIcon>
                      </Group>
                      <Text fz={25} fw={750} mt="sm">
                        {value.toLocaleString(locale)}
                      </Text>
                    </Paper>
                  ))}
                </SimpleGrid>
                <SimpleGrid cols={{ base: 1, md: 2 }}>
                  <Paper withBorder radius="lg" p="lg">
                    <Text fw={700} size="sm">
                      {t("Activity over the last 7 days")}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {t("Workbooks added")}
                    </Text>
                    <Group
                      align="end"
                      justify="space-between"
                      gap="xs"
                      mt="lg"
                      className="profile-activity-chart"
                      role="img"
                      aria-label={`${t("Activity over the last 7 days")}: ${activityDays.map((day) => `${day.date.toLocaleDateString(locale)} ${day.count}`).join(", ")}`}
                    >
                      {activityDays.map((day) => (
                        <Stack
                          key={day.date.toISOString()}
                          align="center"
                          justify="end"
                          gap={5}
                          className="profile-activity-day"
                        >
                          <Text size="xs" c="dimmed">
                            {day.count}
                          </Text>
                          <Box
                            className="profile-activity-bar"
                            style={{
                              height: `${Math.max(4, (day.count / maxActivity) * 84)}px`,
                              opacity: day.count ? 1 : 0.35,
                            }}
                          />
                          <Text size="xs" c="dimmed">
                            {day.date.toLocaleDateString(locale, {
                              weekday: "short",
                            })}
                          </Text>
                        </Stack>
                      ))}
                    </Group>
                  </Paper>
                  <Paper withBorder radius="lg" p="lg">
                    <Text fw={700} size="sm">
                      {t("Translation status")}
                    </Text>
                    <Group justify="center" gap="md" mt="md" wrap="wrap">
                      <RingProgress
                        size={132}
                        thickness={15}
                        roundCaps
                        sections={statusRows
                          .filter((row) => row.count > 0)
                          .map((row) => ({
                            value: jobs.length
                              ? (row.count / jobs.length) * 100
                              : 0,
                            color: row.color,
                            tooltip: `${row.label}: ${row.count}`,
                          }))}
                        label={
                          <Box ta="center">
                            <Text fz={24} fw={700}>
                              {jobs.length}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {t("Total workbooks")}
                            </Text>
                          </Box>
                        }
                      />
                      <Stack gap="xs" className="profile-status-legend">
                        {statusRows.map((row) => (
                          <Group key={row.label} gap="xs">
                            <Box
                              w={7}
                              h={7}
                              bg={row.color}
                              className="profile-status-dot"
                            />
                            <Text size="xs" c="dimmed">
                              {row.label}
                            </Text>
                            <Text size="xs" fw={600}>
                              {row.count}
                            </Text>
                          </Group>
                        ))}
                      </Stack>
                    </Group>
                  </Paper>
                </SimpleGrid>
                <Paper withBorder radius="lg" p="lg">
                  <Group justify="space-between" mb="sm">
                    <Text fw={700} size="sm">
                      {t("Recent translations")}
                    </Text>
                    <Badge variant="light" color="blue">
                      {jobs.length.toLocaleString(locale)}
                    </Badge>
                  </Group>
                  {recentJobs.length ? (
                    <Stack gap="xs">
                      {recentJobs.map((job) => (
                        <Group
                          key={job.id}
                          justify="space-between"
                          wrap="nowrap"
                          className="profile-recent-job"
                        >
                          <Group wrap="nowrap" style={{ minWidth: 0 }}>
                            <ThemeIcon
                              variant="light"
                              color="blue"
                              size="md"
                              radius="md"
                            >
                              <FileSpreadsheet size={16} />
                            </ThemeIcon>
                            <Box style={{ minWidth: 0 }}>
                              <Text fw={600} size="sm" truncate>
                                {job.fileName}
                              </Text>
                              <Text size="xs" c="dimmed">
                                {new Date(job.createdAt).toLocaleDateString(
                                  locale,
                                )}
                              </Text>
                            </Box>
                          </Group>
                          <Badge
                            variant="light"
                            color={
                              job.status === "COMPLETED"
                                ? "teal"
                                : job.status === "FAILED"
                                  ? "red"
                                  : "blue"
                            }
                          >
                            {t(job.status.toLowerCase())}
                          </Badge>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Text size="sm" c="dimmed" py="md">
                      {t("No translation activity yet.")}
                    </Text>
                  )}
                </Paper>
              </>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="account" pt="lg">
          <Stack gap="lg">
            <Paper
              withBorder
              radius="lg"
              p="lg"
              className="profile-account-card"
            >
              <Group gap="sm" mb="md">
                <ThemeIcon variant="light" color="blue" radius="md">
                  <UserRound size={17} />
                </ThemeIcon>
                <div>
                  <Text fw={700}>{t("Account details")}</Text>
                  <Text size="xs" c="dimmed">
                    {t("Update your name and contact information.")}
                  </Text>
                </div>
              </Group>
              {busy ? (
                <Stack aria-label={t("Loading profile")} aria-busy="true">
                  <Skeleton height={36} />
                  <Skeleton height={36} />
                  <Skeleton height={36} />
                </Stack>
              ) : (
                profile && (
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <div className="profile-field">
                      <Text size="xs" c="dimmed">
                        {t("Username")}
                      </Text>
                      {editing ? (
                        <TextInput
                          aria-label={t("Username")}
                          value={profile.username}
                          readOnly
                          disabled
                          mt={4}
                        />
                      ) : (
                        <Text fw={600} mt={4}>
                          {profile.username}
                        </Text>
                      )}
                    </div>
                    <div className="profile-field">
                      <Text size="xs" c="dimmed">
                        {t("Full name")}
                      </Text>
                      {editing ? (
                        <TextInput
                          aria-label={t("Full name")}
                          value={fullName}
                          onChange={(event) => {
                            setFullName(event.currentTarget.value);
                            setSaved(false);
                          }}
                          maxLength={120}
                          mt={4}
                        />
                      ) : (
                        <Text fw={600} mt={4}>
                          {profile.fullName || t("Not provided")}
                        </Text>
                      )}
                    </div>
                    <div className="profile-field">
                      <Text size="xs" c="dimmed">
                        {t("Email")}
                      </Text>
                      {editing ? (
                        <TextInput
                          aria-label={t("Email")}
                          type="email"
                          value={email}
                          onChange={(event) => {
                            setEmail(event.currentTarget.value);
                            setSaved(false);
                          }}
                          maxLength={254}
                          mt={4}
                        />
                      ) : (
                        <Text fw={600} mt={4}>
                          {profile.email || t("Not provided")}
                        </Text>
                      )}
                    </div>
                    <div className="profile-field">
                      <Text size="xs" c="dimmed">
                        {t("Member since")}
                      </Text>
                      <Text fw={600} mt={4}>
                        {new Date(profile.createdAt).toLocaleDateString(
                          locale,
                          { year: "numeric", month: "long", day: "numeric" },
                        )}
                      </Text>
                    </div>
                  </SimpleGrid>
                )
              )}
              {error && profile && (
                <Text c="red" size="sm" mt="md" role="alert">
                  {error}
                </Text>
              )}
              {saved && (
                <Text c="teal" size="sm" mt="md" role="status">
                  {t("Profile saved.")}
                </Text>
              )}
            </Paper>
            {profile?.hasLocalPassword ? (
              <Paper withBorder radius="lg" p="lg">
                <Stack gap="sm">
                  <div>
                    <Text fw={700}>{t("Change password")}</Text>
                    <Text size="sm" c="dimmed">
                      {t(
                        "Use a new password with 12 to 128 characters. Existing sessions will need to sign in again.",
                      )}
                    </Text>
                  </div>
                  {passwordError && (
                    <Alert color="red" role="alert">
                      {passwordError}
                    </Alert>
                  )}
                  {passwordSaved && (
                    <Alert color="teal" role="status">
                      {t("Password changed. Sign in again to continue.")}
                    </Alert>
                  )}
                  <form onSubmit={(event) => void changePassword(event)}>
                    <Stack gap="sm">
                      <PasswordInput
                        required
                        label={t("Current password")}
                        autoComplete="current-password"
                        maxLength={128}
                        value={currentPassword}
                        onChange={(event) =>
                          setCurrentPassword(event.currentTarget.value)
                        }
                      />
                      <PasswordInput
                        required
                        label={t("New password")}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        value={newPassword}
                        onChange={(event) =>
                          setNewPassword(event.currentTarget.value)
                        }
                      />
                      <PasswordInput
                        required
                        label={t("Confirm new password")}
                        autoComplete="new-password"
                        minLength={12}
                        maxLength={128}
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.currentTarget.value)
                        }
                      />
                      <Button type="submit" loading={passwordSaving}>
                        {t("Change password")}
                      </Button>
                    </Stack>
                  </form>
                </Stack>
              </Paper>
            ) : (
              profile && (
                <Alert color="blue">
                  {t(
                    "This account password is managed by your identity provider.",
                  )}
                </Alert>
              )
            )}
            {profile?.isAdmin && <AdminKeycloakSettings token={token} />}
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
