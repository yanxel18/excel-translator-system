import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import ApiService, { type OidcAdminSettings } from "../../api";
import { useLocale } from "../shared/LocaleProvider";
import { validateOidcSettings } from "../auth/oidc-config";

const EMPTY_SETTINGS: OidcAdminSettings = {
  mode: "LOCAL",
  enabled: false,
  keycloakUrl: "",
  realm: "",
  clientId: "",
  issuerUrl: "",
  requiredGroup: "",
};

export default function AdminKeycloakSettings({ token }: { token: string }) {
  const { t } = useLocale();
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revision, setRevision] = useState(0);
  const [errors, setErrors] = useState<
    Partial<Record<keyof OidcAdminSettings, string>>
  >({});

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoaded(false);
    setError("");
    void ApiService.getOidcSettings(token)
      .then((value) => {
        if (
          !value ||
          !["LOCAL", "OIDC", "HYBRID"].includes(value.mode) ||
          value.enabled !== (value.mode !== "LOCAL") ||
          ![
            value.keycloakUrl,
            value.realm,
            value.clientId,
            value.issuerUrl,
            value.requiredGroup,
          ].every((field) => typeof field === "string")
        ) {
          throw new Error("Could not load Keycloak settings.");
        }
        if (active) {
          setSettings(value);
          setLoaded(true);
        }
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load Keycloak settings.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, revision]);

  const update = (key: keyof OidcAdminSettings, value: string) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
      ...(key === "mode" ? { enabled: value !== "LOCAL" } : {}),
    }));
    setSaved(false);
    setErrors({});
    setError("");
  };

  const save = async () => {
    if (!loaded || saving) return;
    const validation = validateOidcSettings(settings);
    setErrors(validation);
    if (Object.keys(validation).length) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const input = {
        mode: settings.mode,
        enabled: settings.mode !== "LOCAL",
        keycloakUrl: settings.keycloakUrl.trim().replace(/\/+$/, ""),
        realm: settings.realm.trim(),
        clientId: settings.clientId.trim(),
        issuerUrl: settings.issuerUrl.trim().replace(/\/+$/, ""),
        requiredGroup: settings.requiredGroup.trim(),
      };
      setSettings(await ApiService.updateOidcSettings(input, token));
      setSaved(true);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not save Keycloak settings.",
      );
    } finally {
      setSaving(false);
    }
  };

  const disabled = loading || saving || !loaded;
  return (
    <Paper
      component="form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      withBorder
      p="lg"
      maw={680}
      w="100%"
      aria-busy={loading || saving}
    >
      <Stack gap="sm">
        <div>
          <Text component="h2" fz="xl" fw={700}>
            {t("Authentication")}
          </Text>
          <Text size="sm" c="dimmed">
            {t("Configure Keycloak sign-in for this application.")}
          </Text>
        </div>
        {loading && <Text role="status">{t("Loading sign-in settings…")}</Text>}
        {error && (
          <Alert color="red" role="alert">
            {t(error)}
          </Alert>
        )}
        {!loading && !loaded && (
          <Button
            type="button"
            variant="default"
            onClick={() => setRevision((value) => value + 1)}
          >
            {t("Retry")}
          </Button>
        )}
        {saved && (
          <Paper withBorder p="sm" role="status">
            <Text c="teal">
              {t("Authentication settings saved. They apply to new sign-ins.")}
            </Text>
          </Paper>
        )}
        <Select
          label={t("Authentication mode")}
          value={settings.mode}
          allowDeselect={false}
          disabled={disabled}
          data={(["LOCAL", "OIDC", "HYBRID"] as const).map((value) => ({
            value,
            label: t(
              `${value} — ${value === "LOCAL" ? "Password only" : value === "OIDC" ? "Keycloak only" : "Password and Keycloak"}`,
            ),
          }))}
          onChange={(value) => {
            if (value) update("mode", value);
          }}
        />
        {settings.mode === "OIDC" && (
          <Alert color="yellow">
            {t(
              "OIDC disables password sign-in. Verify provider access for an administrator before saving.",
            )}
          </Alert>
        )}
        <TextInput
          label={t("Keycloak server URL")}
          placeholder="https://keycloak.example.com"
          maxLength={2048}
          value={settings.keycloakUrl}
          error={errors.keycloakUrl && t(errors.keycloakUrl)}
          onChange={(event) => update("keycloakUrl", event.currentTarget.value)}
          disabled={disabled}
        />
        <TextInput
          label={t("Realm")}
          maxLength={128}
          value={settings.realm}
          error={errors.realm && t(errors.realm)}
          onChange={(event) => update("realm", event.currentTarget.value)}
          disabled={disabled}
        />
        <TextInput
          label={t("Client ID")}
          maxLength={256}
          value={settings.clientId}
          error={errors.clientId && t(errors.clientId)}
          onChange={(event) => update("clientId", event.currentTarget.value)}
          disabled={disabled}
        />
        <TextInput
          label={t("Issuer URL")}
          placeholder="https://keycloak.example.com/realms/excel-translator"
          maxLength={2048}
          value={settings.issuerUrl}
          error={errors.issuerUrl && t(errors.issuerUrl)}
          onChange={(event) => update("issuerUrl", event.currentTarget.value)}
          disabled={disabled}
        />
        <TextInput
          label={t("Required group (optional)")}
          maxLength={512}
          value={settings.requiredGroup}
          onChange={(event) =>
            update("requiredGroup", event.currentTarget.value)
          }
          disabled={disabled}
        />
        <Button type="submit" loading={saving} disabled={disabled}>
          {t("Save authentication settings")}
        </Button>
      </Stack>
    </Paper>
  );
}
