import { type FormEvent, useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { ArrowLeft } from "lucide-react";
import { useLocale } from "../shared/LocaleProvider";
import { management, type Base, type UserDetail } from "./api";
import { validateManagementField, type ManagementField } from "./validation";

export default function UserDetailPage({
  token,
  userId,
  onBack,
}: {
  token: string;
  userId: string;
  onBack: () => void;
}) {
  const { t } = useLocale();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [bases, setBases] = useState<Base[]>([]);
  const [gid, setGid] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [baseId, setBaseId] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      management.user(token, userId),
      management.bases(token, "pageSize=50"),
    ])
      .then(([detail, result]) => {
        if (!active) return;
        setUser(detail);
        setBases(result.data);
        setGid(detail.gid || "");
        setUsername(detail.username);
        setEmail(detail.email || "");
        setBaseId(detail.baseId);
        setEnabled(detail.enabled);
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : t("Could not load user."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, userId, t]);

  const values: Record<ManagementField, string> = {
    gid,
    username,
    email,
    code: "",
    name: "",
    password: "",
  };
  const fieldError = (field: ManagementField) =>
    submitted
      ? validateManagementField(field, values[field]) || undefined
      : undefined;
  const save = async () => {
    setSubmitted(true);
    setError("");
    setSaved(false);
    if (
      validateManagementField("gid", gid) ||
      validateManagementField("username", username) ||
      (email.trim() && validateManagementField("email", email))
    )
      return;
    setSaving(true);
    try {
      const updated = await management.updateUser(token, userId, {
        gid: gid.trim(),
        username: username.trim(),
        email: email.trim() || null,
        baseId,
        enabled,
      });
      setUser(updated);
      setGid(updated.gid || "");
      setUsername(updated.username);
      setEmail(updated.email || "");
      setBaseId(updated.baseId);
      setEnabled(updated.enabled);
      setSaved(true);
    } catch (reason) {
      if (enabled !== user?.enabled) setEnabled(user?.enabled ?? false);
      setError(
        reason instanceof Error ? reason.message : t("Could not save user."),
      );
    } finally {
      setSaving(false);
    }
  };
  const resetPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError("");
    if (newPassword.length < 12 || newPassword.length > 128) {
      setPasswordError(t("Password must contain 12 to 128 characters."));
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t("Passwords do not match."));
      return;
    }
    setSaving(true);
    try {
      await management.resetLocalPassword(token, userId, newPassword);
      setPasswordDialog(false);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSaved(true);
    } catch (reason) {
      setPasswordError(
        reason instanceof Error
          ? reason.message
          : t("Could not reset password."),
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack gap="md" maw={760}>
      <Button
        variant="subtle"
        leftSection={<ArrowLeft size={16} />}
        onClick={onBack}
        w="fit-content"
      >
        {t("Back to users")}
      </Button>
      <Group justify="space-between">
        <Text component="h1" fz="h2" fw={700}>
          {t("Edit user")}
        </Text>
        {user && (
          <Text size="sm" c="dimmed">
            {user.username}
          </Text>
        )}
      </Group>
      {error && (
        <Alert color="red" role="alert">
          {error}
        </Alert>
      )}
      {saved && (
        <Alert color="teal" role="status">
          {t("User saved.")}
        </Alert>
      )}
      {loading ? (
        <Text role="status">{t("Loading")}</Text>
      ) : (
        user && (
          <Paper withBorder p="lg">
            <Stack>
              <Text fw={650}>{t("User details")}</Text>
              <TextInput
                required
                label="GID"
                value={gid}
                maxLength={64}
                error={fieldError("gid")}
                onChange={(event) => setGid(event.currentTarget.value)}
              />
              <TextInput
                required
                label={t("Username")}
                value={username}
                maxLength={100}
                error={fieldError("username")}
                onChange={(event) => setUsername(event.currentTarget.value)}
              />
              <TextInput
                type="email"
                label={t("Email")}
                value={email}
                maxLength={254}
                error={fieldError("email")}
                onChange={(event) => setEmail(event.currentTarget.value)}
              />
              <Select
                label={t("Base")}
                clearable
                searchable
                data={bases.map((base) => ({
                  value: base.id,
                  label: `${base.code} — ${base.name}`,
                }))}
                value={baseId}
                onChange={setBaseId}
              />
              <Switch
                label={t("Enabled")}
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              />
              {passwordSaved && (
                <Alert color="teal" role="status">
                  {t("Local password reset. The user must sign in again.")}
                </Alert>
              )}
              <Group justify="space-between" wrap="wrap">
                {user.hasLocalPassword ? (
                  <Button
                    variant="default"
                    onClick={() => {
                      setPasswordError("");
                      setPasswordDialog(true);
                    }}
                  >
                    {t("Reset local password")}
                  </Button>
                ) : (
                  <Text size="sm" c="dimmed">
                    {t(
                      "This account password is managed by its identity provider.",
                    )}
                  </Text>
                )}
                <Button onClick={() => void save()} loading={saving}>
                  {t("Save changes")}
                </Button>
              </Group>
            </Stack>
          </Paper>
        )
      )}
      <Modal
        opened={passwordDialog}
        onClose={() => {
          if (!saving) {
            setPasswordDialog(false);
            setNewPassword("");
            setConfirmPassword("");
          }
        }}
        title={t("Reset local password")}
        centered
      >
        <form onSubmit={(event) => void resetPassword(event)}>
          <Stack>
            {passwordError && (
              <Alert color="red" role="alert">
                {passwordError}
              </Alert>
            )}
            <Text size="sm" c="dimmed">
              {t("This reset does not reveal the current password.")}
            </Text>
            <PasswordInput
              required
              label={t("New password")}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              value={newPassword}
              onChange={(event) => setNewPassword(event.currentTarget.value)}
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
            <Group justify="end">
              <Button
                type="button"
                variant="default"
                onClick={() => setPasswordDialog(false)}
                disabled={saving}
              >
                {t("Cancel")}
              </Button>
              <Button type="submit" loading={saving}>
                {t("Reset password")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
