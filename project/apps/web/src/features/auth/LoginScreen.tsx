import { useState, FormEvent } from "react";
import {
  Alert,
  Box,
  Button,
  Center,
  Divider,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
} from "@mantine/core";
import { Languages } from "lucide-react";
import type { AuthenticationMode } from "../../api/types";
import { LOCALE_OPTIONS } from "../shared/locale";
import { useLocale } from "../shared/LocaleProvider";

export default function LoginScreen({
  onLogin,
  mode,
  configLoading,
  onRetry,
  onKeycloakLogin,
  oidcReady = false,
  oidcBusy = false,
  oidcError = "",
  sessionExpired = false,
}: {
  onLogin: (username: string, password: string) => Promise<void>;
  mode: AuthenticationMode | null;
  configLoading: boolean;
  onRetry: () => void;
  onKeycloakLogin?: () => Promise<void>;
  oidcReady?: boolean;
  oidcBusy?: boolean;
  oidcError?: string;
  sessionExpired?: boolean;
}) {
  const { locale, setLocale, t } = useLocale();
  const [username, setUsername] = useState("user");
  const [password, setPassword] = useState("password");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!mode || mode === "OIDC" || configLoading || busy || oidcBusy) return;
    setBusy(true);
    setError("");
    try {
      await onLogin(username, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Center mih="100vh" p="md" className="login-page">
      <Paper
        component="form"
        onSubmit={submit}
        withBorder
        shadow="sm"
        radius="lg"
        p={{ base: "lg", sm: "xl" }}
        w="100%"
        maw={420}
        className="login-card"
      >
        <Stack gap="md">
          <Group justify="space-between">
            <ThemeIcon size={44} radius="md" color="blue">
              <Languages size={23} />
            </ThemeIcon>
            <Select
              aria-label={t("Language")}
              data={LOCALE_OPTIONS}
              value={locale}
              onChange={(value) => {
                if (value === "en" || value === "ja" || value === "zh")
                  setLocale(value);
              }}
              w={130}
            />
          </Group>
          <Box>
            <Text fz="h2" fw={700}>
              {t("Welcome back")}
            </Text>
            <Text c="dimmed" size="sm">
              {t("Sign in to manage workbook translations.")}
            </Text>
          </Box>
          {configLoading && (
            <Text role="status">{t("Loading sign-in settings…")}</Text>
          )}
          {sessionExpired && (
            <Alert color="yellow" role="status">
              {t("Your session has expired. Please sign in again.")}
            </Alert>
          )}
          {mode && mode !== "OIDC" && (
            <>
              <TextInput
                label={t("Username")}
                value={username}
                onChange={(event) => setUsername(event.currentTarget.value)}
                autoComplete="username"
                required
              />
              <TextInput
                label={t("Password")}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.currentTarget.value)}
                autoComplete="current-password"
                required
              />
              {error && (
                <Alert color="red" role="alert">
                  {t(error)}
                </Alert>
              )}
              <Button
                type="submit"
                loading={busy}
                disabled={oidcBusy}
                fullWidth
              >
                {t("Sign in")}
              </Button>
            </>
          )}
          {oidcError && (
            <>
              <Alert color="red" role="alert">
                {t(oidcError)}
              </Alert>
              <Button
                type="button"
                variant="subtle"
                disabled={oidcBusy || configLoading}
                onClick={onRetry}
              >
                {t("Retry")}
              </Button>
            </>
          )}
          {onKeycloakLogin && (
            <>
              {mode === "HYBRID" && (
                <Divider label={t("or")} labelPosition="center" />
              )}
              <Button
                type="button"
                variant={mode === "OIDC" ? "filled" : "default"}
                disabled={!oidcReady || busy}
                loading={oidcBusy}
                onClick={() => void onKeycloakLogin()}
                fullWidth
              >
                {t("Continue with Keycloak")}
              </Button>
            </>
          )}
          {mode && mode !== "OIDC" && (
            <Text c="dimmed" size="xs" ta="center">
              {t("Local development account: user / password")}
            </Text>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
