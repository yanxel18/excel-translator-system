import { useEffect, useRef, useState } from "react";
import { useDisclosure } from "@mantine/hooks";
import Keycloak from "keycloak-js";
import ApiService, {
  type Job,
  type OidcPublicConfig,
  type UserProfile,
  type VocabularyGroup,
} from "./api";
import { SESSION_EXPIRED_EVENT, SessionExpiredError } from "./api/client";
import NotificationsPage from "./features/notifications/NotificationsPage";
import LoginScreen from "./features/auth/LoginScreen";
import { validPublicConfig } from "./features/auth/oidc-config";
import {
  consumeValidatedReturnRoute,
  preserveValidatedReturnRoute,
  useAppRoute,
} from "./features/app-shell/useAppRoute";
import AppFrame from "./features/app-shell/AppFrame";
import VocabularyPage from "./features/vocabulary/VocabularyPage";
import HistoryPage from "./features/history/HistoryPage";
import ProfilePage from "./features/profile/ProfilePage";
import ChangelogPage from "./features/changelog/ChangelogPage";
import TranslationSettingsModal from "./features/workspace/TranslationSettingsModal";
import WorkspacePage from "./features/workspace/WorkspacePage";
import SystemSettings from "./features/system-settings/SystemSettings";
import { Alert, Button, Paper, Stack, Text } from "@mantine/core";
import { useWorkspaceController } from "./features/workspace/useWorkspaceController";
import { useLocale } from "./features/shared/LocaleProvider";
import "./ModernApp.css";

export default function ModernApp() {
  const [token, setToken] = useState(
    () => localStorage.getItem("excel-translator-token") || "",
  );
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const sessionExpiredRef = useRef(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [selectedNotificationId, setSelectedNotificationId] =
    useState<string>();
  const { view, page, search, navigate: setView } = useAppRoute();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState(false);
  const [settingsJob, setSettingsJob] = useState<Job | null>(null);
  const [vocabularyGroups, setVocabularyGroups] = useState<VocabularyGroup[]>(
    [],
  );
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState("");
  const [
    mobileNavigationOpen,
    { toggle: toggleMobileNavigation, close: closeMobileNavigation },
  ] = useDisclosure(false);
  const [oidcBusy, setOidcBusy] = useState(false);
  const [oidcError, setOidcError] = useState("");
  const [oidcConfig, setOidcConfig] = useState<OidcPublicConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [configRevision, setConfigRevision] = useState(0);
  const [oidcReady, setOidcReady] = useState(false);
  const keycloakRef = useRef<Keycloak | null>(null);
  const { t } = useLocale();
  const workspace = useWorkspaceController(token, t);
  useEffect(() => {
    const expireSession = (event: Event) => {
      const expiredToken = (event as CustomEvent<{ token?: string }>).detail
        ?.token;
      if (
        !expiredToken ||
        expiredToken !== tokenRef.current ||
        sessionExpiredRef.current
      )
        return;
      sessionExpiredRef.current = true;
      preserveValidatedReturnRoute();
      localStorage.removeItem("excel-translator-token");
      workspace.reset();
      keycloakRef.current?.clearToken();
      keycloakRef.current = null;
      setOidcConfig(null);
      setOidcReady(false);
      setSettingsJob(null);
      setSettingsError("");
      setSettingsBusy(false);
      setToken("");
      setSessionExpired(true);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expireSession);
    return () =>
      window.removeEventListener(SESSION_EXPIRED_EVENT, expireSession);
  }, []);

  useEffect(() => {
    let active = true;
    setIsAdmin(null);
    setProfile(null);
    setProfileLoadError(false);
    if (!token) {
      setProfileLoading(false);
      return () => {
        active = false;
      };
    }
    setProfileLoading(true);
    void ApiService.getProfile(token)
      .then((loadedProfile) => {
        if (active) {
          setProfile(loadedProfile);
          setIsAdmin(loadedProfile.isAdmin);
          setProfileLoadError(false);
        }
      })
      .catch(() => {
        if (active) {
          setIsAdmin(false);
          setProfileLoadError(true);
        }
      })
      .finally(() => {
        if (active) setProfileLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (token) return;
    let active = true;
    setConfigLoading(true);
    setOidcConfig(null);
    setOidcReady(false);
    keycloakRef.current = null;
    setOidcError("");
    void ApiService.getOidcConfig()
      .then((config) => {
        if (!validPublicConfig(config))
          throw new Error(
            "Sign-in configuration is invalid. Contact an administrator.",
          );
        if (active) setOidcConfig(config);
      })
      .catch((reason) => {
        if (active)
          setOidcError(
            reason instanceof Error
              ? reason.message
              : "Could not load sign-in configuration.",
          );
      })
      .finally(() => {
        if (active) setConfigLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, configRevision]);

  useEffect(() => {
    if (!oidcConfig || oidcConfig.mode === "LOCAL" || token) return;
    const { url, realm, clientId } = oidcConfig;
    let active = true;
    let keycloak: Keycloak | null = null;
    setOidcBusy(true);
    setOidcReady(false);
    const initialize = async () => {
      try {
        keycloak = new Keycloak({ url, realm, clientId });
        const callback = [
          window.location.hash.slice(1),
          window.location.search.slice(1),
        ].some((value) => {
          const params = new URLSearchParams(value);
          return (
            params.has("code") || params.has("error") || params.has("state")
          );
        });
        // Process callbacks, but never redirect a HYBRID visitor away from password login.
        const authenticated = await keycloak
          .init({ pkceMethod: "S256", checkLoginIframe: false })
          .catch(() => {
            throw new Error("Keycloak sign-in failed.");
          });
        if (!active) return;
        if (callback && !authenticated)
          throw new Error("Keycloak sign-in failed.");
        keycloakRef.current = keycloak;
        setOidcReady(true);
        if (!authenticated) return;
        if (!keycloak.token) throw new Error("Keycloak sign-in failed.");
        const result = await ApiService.exchangeKeycloakToken(keycloak.token);
        if (
          !result ||
          typeof result.access_token !== "string" ||
          !result.access_token.trim()
        )
          throw new Error("Keycloak sign-in failed.");
        if (active) {
          const returnRoute = consumeValidatedReturnRoute();
          sessionExpiredRef.current = false;
          setSessionExpired(false);
          localStorage.setItem("excel-translator-token", result.access_token);
          setView(
            returnRoute?.view ?? "workspace",
            undefined,
            returnRoute?.params,
          );
          setToken(result.access_token);
        }
      } catch (reason) {
        keycloak?.clearToken();
        if (active)
          setOidcError(
            reason instanceof Error
              ? reason.message
              : "Keycloak sign-in failed.",
          );
      } finally {
        if (active) setOidcBusy(false);
      }
    };
    void initialize();
    return () => {
      active = false;
    };
  }, [oidcConfig, token]);

  const openJobSettings = async (job: Job) => {
    setSettingsBusy(true);
    setSettingsError("");
    try {
      const [details, groups] = await Promise.all([
        ApiService.getJob(job.id, token),
        ApiService.getVocabularyGroups(token),
      ]);
      setVocabularyGroups(groups);
      const compatible = groups.some(
        (group) =>
          group.id === details.vocabularyGroupId &&
          group.sourceLanguage === details.sourceLanguage &&
          group.targetLanguage === details.targetLanguage,
      );
      setSettingsJob({
        ...details,
        vocabularyGroupId: compatible ? details.vocabularyGroupId : null,
      });
    } catch (reason) {
      if (!(reason instanceof SessionExpiredError))
        setSettingsError(
          reason instanceof Error
            ? reason.message
            : "Could not load workbook settings.",
        );
    } finally {
      setSettingsBusy(false);
    }
  };

  const saveSettings = async (startAfterSave = false) => {
    if (!settingsJob) return;
    setSettingsBusy(true);
    setSettingsError("");
    try {
      await ApiService.updateJobSettings(settingsJob.id, settingsJob, token);
      if (startAfterSave)
        await ApiService.startTranslation(settingsJob.id, token);
      setSettingsJob(null);
      await workspace.refresh();
    } catch (reason) {
      if (!(reason instanceof SessionExpiredError))
        setSettingsError(
          reason instanceof Error
            ? reason.message
            : "Could not save workbook settings.",
        );
    } finally {
      setSettingsBusy(false);
    }
  };

  const login = async (username: string, password: string) => {
    const result = await ApiService.login(username, password);
    const returnRoute = consumeValidatedReturnRoute();
    sessionExpiredRef.current = false;
    setSessionExpired(false);
    localStorage.setItem("excel-translator-token", result.access_token);
    setView(returnRoute?.view ?? "workspace", undefined, returnRoute?.params);
    setToken(result.access_token);
  };

  const loginWithKeycloak = async () => {
    setOidcError("");
    setOidcBusy(true);
    try {
      const keycloak = keycloakRef.current;
      if (!keycloak || !oidcReady) throw new Error("Keycloak is not ready.");
      await keycloak.login({ redirectUri: window.location.href });
    } catch {
      setOidcError("Keycloak sign-in failed.");
    } finally {
      setOidcBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("excel-translator-token");
    sessionStorage.removeItem("excel-translator-return-route");
    sessionExpiredRef.current = false;
    setSessionExpired(false);
    workspace.reset();
    setOidcConfig(null);
    setOidcReady(false);
    keycloakRef.current = null;
    setToken("");
  };

  if (!token)
    return (
      <LoginScreen
        sessionExpired={sessionExpired}
        mode={oidcConfig?.mode ?? null}
        configLoading={configLoading}
        onRetry={() => setConfigRevision((value) => value + 1)}
        onLogin={login}
        onKeycloakLogin={
          oidcConfig && oidcConfig.mode !== "LOCAL"
            ? loginWithKeycloak
            : undefined
        }
        oidcReady={oidcReady}
        oidcBusy={oidcBusy}
        oidcError={oidcError}
      />
    );

  const compatibleVocabularyGroups = settingsJob
    ? vocabularyGroups.filter(
        (group) =>
          group.sourceLanguage === settingsJob.sourceLanguage &&
          group.targetLanguage === settingsJob.targetLanguage,
      )
    : [];
  const settingsValid = Boolean(
    settingsJob?.selectedSheets.length &&
    settingsJob.sourceLanguage !== settingsJob.targetLanguage &&
    (!settingsJob.vocabularyGroupId ||
      compatibleVocabularyGroups.some(
        (group) => group.id === settingsJob.vocabularyGroupId,
      )),
  );

  return (
    <AppFrame
      isAdmin={isAdmin === true}
      profile={profile}
      profileLoading={profileLoading}
      profileLoadError={profileLoadError}
      onOpenNotification={(id) => {
        setSelectedNotificationId(id);
        setView("notifications");
      }}
      token={token}
      view={view ?? "workspace"}
      onNavigate={setView}
      onSignOut={logout}
      mobileOpen={mobileNavigationOpen}
      onToggleMobile={toggleMobileNavigation}
      onCloseMobile={closeMobileNavigation}
    >
      {settingsError && !settingsJob && (
        <Alert
          color="red"
          withCloseButton
          onClose={() => setSettingsError("")}
          mb="md"
        >
          {settingsError}
        </Alert>
      )}
      {view?.startsWith("settings/") ? (
        isAdmin === null ? (
          <Text role="status">{t("Loading")}</Text>
        ) : isAdmin ? (
          <SystemSettings
            token={token}
            section={view}
            search={search}
            onNavigate={setView}
          />
        ) : (
          <Alert color="red">{t("Administrator access is required.")}</Alert>
        )
      ) : view === null ? (
        <Paper withBorder p="xl">
          <Stack align="start">
            <Text component="h1" fz="h2" fw={700}>
              {t("Page not found")}
            </Text>
            <Text>{t("The page you requested is not available.")}</Text>
            <Button onClick={() => setView("workspace")}>
              {t("Go to Workspace")}
            </Button>
          </Stack>
        </Paper>
      ) : view === "workspace" ? (
        <WorkspacePage
          file={workspace.file}
          fileInput={workspace.fileInput}
          error={workspace.error}
          busy={workspace.busy}
          jobs={workspace.jobs}
          jobsLoading={workspace.jobsLoading}
          token={token}
          onDismissError={workspace.dismissError}
          onSelectFile={workspace.selectFile}
          onUpload={workspace.upload}
          onRefresh={() => void workspace.refresh()}
          onHistory={() => setView("history")}
          onStart={(job) => void openJobSettings(job)}
          onRetry={(id) =>
            void workspace.run(() => ApiService.retryJob(id, token))
          }
          onCancel={(id) =>
            void workspace.run(() => ApiService.cancelJob(id, token))
          }
          onDownload={workspace.download}
          onConfigure={(job) => void openJobSettings(job)}
        />
      ) : view === "notifications" ? (
        <NotificationsPage token={token} selectedId={selectedNotificationId} />
      ) : view === "vocabulary" ? (
        <VocabularyPage token={token} />
      ) : view === "history" ? (
        <HistoryPage
          token={token}
          page={page}
          search={search}
          onQueryChange={(params) => setView("history", undefined, params)}
        />
      ) : view === "profile" ? (
        <ProfilePage
          token={token}
          search={search}
          onTabChange={(tab) => {
            const params = new URLSearchParams(search);
            params.set("tab", tab);
            setView("profile", undefined, params);
          }}
          onNewTranslation={() => setView("workspace")}
        />
      ) : (
        <ChangelogPage token={token} />
      )}
      <TranslationSettingsModal
        job={settingsJob}
        vocabularyGroups={vocabularyGroups}
        busy={settingsBusy}
        error={settingsError}
        valid={settingsValid}
        onClose={() => setSettingsJob(null)}
        onJobChange={setSettingsJob}
        onSave={(startAfterSave) => void saveSettings(startAfterSave)}
      />
    </AppFrame>
  );
}
