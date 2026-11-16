import { useEffect, useRef, useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Pagination,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Building2, Check, ChevronRight,
  CalendarClock, CircleAlert, Eye, LockKeyhole, Mail, Pencil, Plus, Save,
  Search, Settings, ShieldCheck, SlidersHorizontal, Trash2, UserRound, Users, X,
} from "lucide-react";
import type { View } from "../app-shell/types";
import { useLocale } from "../shared/LocaleProvider";
import AdminKeycloakSettings from "../profile/AdminKeycloakSettings";
import ApplicationSettingsPanel from "./ApplicationSettingsPanel";
import MaintenanceSettingsPanel from "./MaintenanceSettingsPanel";
import { management, type Base, type User } from "./api";
import UserDetailPage from "./UserDetailPage";
import {
  fieldLimits,
  passwordMinLength,
  validateManagementField,
  type ManagementField,
} from "./validation";
import "./system-settings.css";

type Section =
  | "settings/users"
  | "settings/bases"
  | "settings/files"
  | "settings/authentication"
  | "settings/maintenance";
type Props = {
  token: string;
  section: string;
  search: string;
  onNavigate: (view: View, page?: number, params?: URLSearchParams) => void;
};
const labels = {
  ja: {
    "Manage people, bases, file limits, sign-in preferences, and maintenance notices.": "ユーザー、拠点、ファイル上限、サインイン設定、メンテナンス通知を管理します。",
    "Manage user accounts and application access.": "ユーザーアカウントとアプリへのアクセスを管理します。",
    "Organize the bases assigned to your users.": "ユーザーが所属する拠点を管理します。",
    "User access updated.": "ユーザーのアクセス設定を更新しました。",
    "Could not update user access.": "ユーザーのアクセス設定を更新できませんでした。",
    View: "表示",
    "Assign base": "拠点を変更",
    "Base reassigned.": "拠点を変更しました。",
    Results: "件数",
    "Base deleted.": "拠点を削除しました。",
    "User created.": "ユーザーを作成しました。",
    "Base saved.": "拠点を保存しました。",
    Pages: "ページ",
    "System Settings": "システム設定",
    Users: "ユーザー",
    Bases: "拠点",
    Authentication: "認証",
    "Files & processing": "ファイルと処理",
    "Maintenance notices": "メンテナンス通知",
    "Configure the maintenance notice shown to signed-in users.": "サインイン中のユーザーに表示するメンテナンス通知を設定します。",
    Search: "検索",
    "Clear search": "検索をクリア",
    "Search users or bases": "ユーザーまたは拠点を検索",
    "Search bases": "拠点を検索",
    Create: "作成",
    "Create user": "ユーザーを作成",
    "Create base": "拠点を作成",
    Edit: "編集",
    Delete: "削除",
    Save: "保存",
    Cancel: "キャンセル",
    Code: "コード",
    Name: "名前",
    "Base name (acronym)": "拠点名（略称）",
    Username: "ユーザー名",
    "Full name": "氏名",
    Email: "メールアドレス",
    Base: "拠点",
    Enabled: "有効",
    Password: "パスワード",
    Actions: "操作",
    All: "すべて",
    Yes: "はい",
    No: "いいえ",
    Close: "閉じる",
    "No results": "結果がありません",
    Loading: "読み込み中",
    "Rows per page": "表示件数",
    "Delete base?": "拠点を削除しますか？",
    "Assigned bases cannot be deleted.":
      "ユーザーが所属する拠点は削除できません。",
  },
  zh: {
    "Manage people, bases, file limits, sign-in preferences, and maintenance notices.": "管理用户、据点、文件限制、登录设置和维护通知。",
    "Manage user accounts and application access.": "管理用户账户和应用访问权限。",
    "Organize the bases assigned to your users.": "管理分配给用户的据点。",
    "User access updated.": "已更新用户访问权限。",
    "Could not update user access.": "无法更新用户访问权限。",
    View: "查看",
    "Assign base": "更改据点",
    "Base reassigned.": "据点已更改。",
    Results: "结果数",
    "Base deleted.": "已删除据点。",
    "User created.": "已创建用户。",
    "Base saved.": "已保存据点。",
    Pages: "页码",
    "System Settings": "系统设置",
    Users: "用户",
    Bases: "据点",
    Authentication: "身份验证",
    "Files & processing": "文件与处理",
    "Maintenance notices": "维护通知",
    "Configure the maintenance notice shown to signed-in users.": "配置向已登录用户显示的维护通知。",
    Search: "搜索",
    "Clear search": "清除搜索",
    "Search users or bases": "搜索用户或据点",
    "Search bases": "搜索据点",
    Create: "创建",
    "Create user": "创建用户",
    "Create base": "创建据点",
    Edit: "编辑",
    Delete: "删除",
    Save: "保存",
    Cancel: "取消",
    Code: "代码",
    Name: "名称",
    "Base name (acronym)": "据点名称（简称）",
    Username: "用户名",
    "Full name": "姓名",
    Email: "电子邮件",
    Base: "据点",
    Enabled: "启用",
    Password: "密码",
    Actions: "操作",
    All: "全部",
    Yes: "是",
    No: "否",
    Close: "关闭",
    "No results": "没有结果",
    Loading: "正在加载",
    "Rows per page": "每页行数",
    "Delete base?": "删除据点？",
    "Assigned bases cannot be deleted.": "已分配用户的据点无法删除。",
  },
};
const validationLabels: Record<"ja" | "zh", Record<string, string>> = {
  ja: {
    "GID cannot contain control characters.": "GIDに制御文字は使用できません。",
    "Username cannot contain control characters.": "ユーザー名に制御文字は使用できません。",
    "Password must contain 12 to 128 characters.":
      "パスワードは12～128文字で入力してください。",
    "Use ASCII letters, digits, underscore or hyphen.":
      "半角英数字、アンダースコア、ハイフンを使用してください。",
    "Enter a valid email address.": "有効なメールアドレスを入力してください。",
    ...Object.fromEntries(
      [32, 50, 64, 100, 254].map((max) => [
        `Enter 1 to ${max} characters.`,
        `1～${max}文字で入力してください。`,
      ]),
    ),
  },
  zh: {
    "GID cannot contain control characters.": "GID不能包含控制字符。",
    "Username cannot contain control characters.": "用户名不能包含控制字符。",
    "Password must contain 12 to 128 characters.":
      "密码长度必须为12至128个字符。",
    "Use ASCII letters, digits, underscore or hyphen.":
      "请使用ASCII字母、数字、下划线或连字符。",
    "Enter a valid email address.": "请输入有效的电子邮件地址。",
    ...Object.fromEntries(
      [32, 50, 64, 100, 254].map((max) => [
        `Enter 1 to ${max} characters.`,
        `请输入1至${max}个字符。`,
      ]),
    ),
  },
};
export default function SystemSettings({
  token,
  section,
  search,
  onNavigate,
}: Props) {
  const { locale } = useLocale();
  const t = (s: string) =>
    locale === "en"
      ? s
      : (labels[locale] as Record<string, string>)[s] ||
        validationLabels[locale][s] ||
        s;
  const selected: Section = section.startsWith("settings/users")
    ? "settings/users"
    : (section as Section);
  const detailId = /^settings\/users\/([0-9a-f-]{36})$/i.exec(section)?.[1];
  const params = new URLSearchParams(search);
  const positive = (s: string | null, fallback: number, max: number) =>
    s && /^[1-9]\d*$/.test(s) && Number(s) <= max ? Number(s) : fallback;
  const page = positive(params.get("page"), 1, 100000);
  const rawSize = positive(params.get("pageSize"), 10, 50);
  const pageSize = [10, 20, 30, 40, 50].includes(rawSize) ? rawSize : 10;
  const q = (params.get("q") || "").slice(
    0,
    selected === "settings/bases" ? 100 : 120,
  );
  const allowedSort =
    selected === "settings/bases"
      ? ["code", "name"]
      : ["username", "fullName", "email", "base", "enabled"];
  const sort = allowedSort.includes(params.get("sort") || "")
    ? params.get("sort")!
    : selected === "settings/bases"
      ? "code"
      : "username";
  const direction = params.get("direction") === "desc" ? "desc" : "asc";
  const [term, setTerm] = useState(q);
  const searchInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<(Base | User)[]>([]);
  const [bases, setBases] = useState<Base[]>([]);
  const [knownBases, setKnownBases] = useState<Base[]>([]);
  const [notice, setNotice] = useState("");
  const [baseSearch, setBaseSearch] = useState("");
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState<Base | null>(null);
  const [assigning, setAssigning] = useState<User | null>(null);
  const [dialog, setDialog] = useState<
    "base" | "user" | "delete" | "assign" | null
  >(null);
  const [code, setCode] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [userBase, setUserBase] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const fieldValues = { gid: "", username, fullName, email, code, name: "", password };
  const fieldError = (field: ManagementField) => {
    const message = submitted
      ? validateManagementField(field, fieldValues[field])
      : undefined;
    return message ? t(message) : undefined;
  };
  useEffect(() => setSubmitted(false), [dialog, editing]);
  useEffect(() => setTerm(q), [q]);
  useEffect(() => {
    if (section === "settings/users/new") {
      setError("");
      setDialog("user");
    } else setDialog((current) => (current === "user" ? null : current));
  }, [section]);
  useEffect(() => {
    if (
      selected === "settings/authentication" ||
      selected === "settings/files" ||
      detailId
    )
      return;
    let active = true;
    setBusy(true);
    setError("");
    setRows([]);
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      sort,
      direction,
    });
    if (q) query.set("q", q);
    const fetchPage =
      selected === "settings/bases"
        ? management.bases(token, query.toString())
        : management.users(token, query.toString());
    void fetchPage
      .then((value) => {
        if (active) {
          setRows(value.data);
          setTotal(value.total);
        }
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [
    token,
    selected,
    detailId,
    page,
    pageSize,
    sort,
    direction,
    q,
    revision,
  ]);
  useEffect(() => {
    if (selected !== "settings/users") return;
    let active = true;
    const query = new URLSearchParams({ pageSize: "50" });
    if (baseSearch) query.set("q", baseSearch.slice(0, 100));
    void management
      .bases(token, query.toString())
      .then((value) => {
        if (active) {
          setBases(value.data);
          setKnownBases((previous) => [
            ...new Map(
              [...previous, ...value.data].map((base) => [base.id, base]),
            ).values(),
          ]);
        }
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : String(reason));
      });
    return () => {
      active = false;
    };
  }, [token, selected, baseSearch, revision]);
  const change = (updates: Record<string, string>, reset = true) => {
    const next = new URLSearchParams(search);
    if (selected === "settings/users") {
      next.delete("baseId");
      next.delete("enabled");
    }
    Object.entries(updates).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (reset) next.delete("page");
    onNavigate(selected, undefined, next);
  };
  const openBase = (base?: Base) => {
    setEditing(base || null);
    setCode(base?.code || "");
    setError("");
    setDialog("base");
  };
  const openUser = () => {
    setUsername("");
    setFullName("");
    setEmail("");
    setUserBase("");
    setPassword("");
    setError("");
    onNavigate("settings/users/new");
  };
  const save = async () => {
    setSubmitted(true);
    const fields: ManagementField[] =
      dialog === "base"
        ? ["code"]
        : dialog === "user"
          ? ["username", "fullName", "email", "password"]
          : [];
    if (
      fields.some((field) => validateManagementField(field, fieldValues[field]))
    )
      return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (dialog === "base")
        await management.saveBase(
          token,
          editing
            ? { code: code.trim() }
            : { code: code.trim(), name: code.trim().toUpperCase() },
          editing?.id,
        );
      if (dialog === "delete" && editing)
        await management.deleteBase(token, editing.id);
      if (dialog === "user")
        await management.createUser(token, {
          username: username.trim(),
          fullName: fullName.trim(),
          email: email.trim(),
          baseAcronym: userBase,
          password,
        });
      if (dialog === "assign" && assigning)
        await management.assignBase(token, assigning.id, userBase);
      setDialog(null);
      setPassword("");
      setRevision((n) => n + 1);
      setNotice(
        dialog === "delete"
          ? t("Base deleted.")
          : dialog === "user"
            ? t("User created.")
            : dialog === "assign"
              ? t("Base reassigned.")
              : t("Base saved."),
      );
      if (dialog === "user") onNavigate("settings/users");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };
  const toggleAccess = async (user: User) => {
    if (updatingUser) return;
    setUpdatingUser(user.id);
    setError("");
    setNotice("");
    try {
      await management.updateUser(token, user.id, { enabled: !user.enabled });
      setRevision((value) => value + 1);
      setNotice(t("User access updated."));
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : t("Could not update user access."),
      );
    } finally {
      setUpdatingUser(null);
    }
  };
  const optionBases = [
    ...new Map(
      [
        ...bases,
        ...knownBases.filter((base) => base.code === userBase),
      ].map((base) => [base.id, base]),
    ).values(),
  ];
  const acronymOptions = optionBases.map((base) => ({
    value: base.code,
    label: base.code,
  }));
  if (userBase && !acronymOptions.some((option) => option.value === userBase))
    acronymOptions.push({ value: userBase, label: userBase });
  const column = (key: string, title: string) => (
    <Table.Th
      aria-sort={
        sort === key
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : undefined
      }
    >
      <Button
        className="settings-sort"
        variant="subtle"
        size="compact-sm"
        rightSection={
          sort !== key ? <ArrowUpDown size={14} aria-hidden="true" /> :
            direction === "asc" ? <ArrowUp size={14} aria-hidden="true" /> :
              <ArrowDown size={14} aria-hidden="true" />
        }
        onClick={() =>
          change({
            sort: key,
            direction: sort === key && direction === "asc" ? "desc" : "asc",
          })
        }
      >
        {t(title)}
      </Button>
    </Table.Th>
  );
  if (detailId)
    return (
      <UserDetailPage
        token={token}
        userId={detailId}
        onBack={() => onNavigate("settings/users")}
      />
    );
  return (
    <Stack gap="lg" className="system-settings">
      <Group gap="md" wrap="nowrap" className="settings-page-heading">
        <span className="settings-heading-icon"><Settings size={24} aria-hidden="true" /></span>
        <div>
          <Text component="h1" fz="h2" fw={700} m={0}>
            {t("System Settings")}
          </Text>
          <Text size="sm" c="dimmed" mt={4}>
            {t("Manage people, bases, file limits, sign-in preferences, and maintenance notices.")}
          </Text>
        </div>
      </Group>
      <div className="system-settings-layout">
        <nav className="system-settings-nav" aria-label={t("System Settings")}>
          {(
            [
              { id: "settings/users", label: "Users", Icon: Users },
              { id: "settings/bases", label: "Bases", Icon: Building2 },
              {
                id: "settings/authentication",
                label: "Authentication",
                Icon: ShieldCheck,
              },
              {
                id: "settings/files",
                label: "Files & processing",
                Icon: SlidersHorizontal,
              },
              {
                id: "settings/maintenance",
                label: "Maintenance notices",
                Icon: CalendarClock,
              },
            ] as const
          ).map(({ id, label, Icon }) => (
            <Button
              key={id}
              className="settings-nav-item"
              variant={selected === id ? "light" : "subtle"}
              data-active={selected === id || undefined}
              aria-current={selected === id ? "page" : undefined}
              leftSection={<Icon size={18} aria-hidden="true" />}
              rightSection={<ChevronRight size={14} aria-hidden="true" />}
              onClick={() => onNavigate(id)}
            >
              {t(label)}
            </Button>
          ))}
        </nav>
        <Stack className="system-settings-content" gap="md">
          {selected === "settings/authentication" ? (
            <AdminKeycloakSettings token={token} />
          ) : selected === "settings/maintenance" ? (
            <MaintenanceSettingsPanel token={token} />
          ) : selected === "settings/files" ? (
            <ApplicationSettingsPanel token={token} />
          ) : (
            <Paper withBorder p="lg" className="settings-panel">
              <Stack gap="lg">
              <Group justify="space-between" className="settings-section-heading">
                <div>
                  <Group gap="xs">
                    {selected === "settings/users" ? <Users size={20} aria-hidden="true" /> : <Building2 size={20} aria-hidden="true" />}
                    <Text component="h2" fz="xl" fw={700} m={0}>
                      {t(selected === "settings/users" ? "Users" : "Bases")}
                    </Text>
                  </Group>
                  <Text size="sm" c="dimmed" mt={4}>
                    {t(selected === "settings/users" ? "Manage user accounts and application access." : "Organize the bases assigned to your users.")}
                  </Text>
                </div>
                <Button
                  leftSection={<Plus size={16} aria-hidden="true" />}
                  onClick={() =>
                    selected === "settings/users" ? openUser() : openBase()
                  }
                >
                  {t(
                    selected === "settings/users"
                      ? "Create user"
                      : "Create base",
                  )}
                </Button>
              </Group>
              <form
                className="settings-filters"
                onSubmit={(event) => {
                  event.preventDefault();
                  change({ q: term.trim() });
                }}
              >
                <Group align="end" gap="sm">
                  <TextInput
                    ref={searchInput}
                    className="settings-search"
                    leftSection={<Search size={16} aria-hidden="true" />}
                    rightSection={
                      selected === "settings/users" && term ? (
                        <ActionIcon
                          type="button"
                          aria-label={t("Clear search")}
                          variant="subtle"
                          color="gray"
                          size="sm"
                          onClick={() => {
                            setTerm("");
                            change({ q: "" });
                            searchInput.current?.focus();
                          }}
                        >
                          <X size={18} aria-hidden="true" />
                        </ActionIcon>
                      ) : null
                    }
                    rightSectionPointerEvents="all"
                    label={t("Search")}
                    placeholder={t(
                      selected === "settings/users"
                        ? "Search users or bases"
                        : "Search bases",
                    )}
                    value={term}
                    maxLength={selected === "settings/users" ? 120 : 100}
                    onChange={(e) => setTerm(e.currentTarget.value)}
                  />
                  <Button type="submit" variant="default" leftSection={<Search size={16} aria-hidden="true" />}>
                    {t("Search")}
                  </Button>
                </Group>
              </form>
              {notice && !dialog && (
                <Alert
                  color="green"
                  icon={<Check size={18} aria-hidden="true" />}
                  aria-live="polite"
                  withCloseButton
                  closeButtonLabel={t("Close")}
                  onClose={() => setNotice("")}
                >
                  {notice}
                </Alert>
              )}
              {error && !dialog && (
                <Alert color="red" role="alert" icon={<CircleAlert size={18} aria-hidden="true" />}>
                  {error}
                </Alert>
              )}
              <Paper withBorder className="settings-table-scroll" role="region" aria-label={t(selected === "settings/users" ? "Users" : "Bases")} tabIndex={0} aria-busy={busy}>
                <Table miw={selected === "settings/users" ? 880 : 480} verticalSpacing="sm" horizontalSpacing="md" highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      {selected === "settings/users" ? (
                        <>
                          {column("username", "Username")}
                          {column("fullName", "Full name")}
                          {column("email", "Email")}
                          {column("base", "Base")}
                          {column("enabled", "Enabled")}
                          <Table.Th>{t("Actions")}</Table.Th>
                        </>
                      ) : (
                        <>
                          {column("code", "Base")}
                          <Table.Th>{t("Actions")}</Table.Th>
                        </>
                      )}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((row) =>
                      selected === "settings/users"
                        ? (() => {
                            const u = row as User;
                            return (
                              <Table.Tr key={u.id}>
                                <Table.Td>
                                  <Group gap="xs" wrap="nowrap">
                                    <span className="settings-record-icon"><UserRound size={16} aria-hidden="true" /></span>
                                    <Text size="sm" fw={600}>{u.username}</Text>
                                  </Group>
                                </Table.Td>
                                <Table.Td>{u.fullName || "—"}</Table.Td>
                                <Table.Td>{u.email || "—"}</Table.Td>
                                <Table.Td>
                                  {u.base ? u.base.code : "—"}
                                </Table.Td>
                                <Table.Td>
                                  <Switch
                                    role="switch"
                                    aria-label={`${t("Enabled")}: ${u.username}`}
                                    checked={u.enabled}
                                    disabled={busy || updatingUser !== null}
                                    onChange={() => void toggleAccess(u)}
                                    label={t(u.enabled ? "Yes" : "No")}
                                    size="md"
                                  />
                                </Table.Td>
                                <Table.Td>
                                  <Group gap="xs">
                                    <Button
                                      size="compact-sm"
                                      variant="subtle"
                                      leftSection={<Eye size={14} aria-hidden="true" />}
                                      onClick={() =>
                                        onNavigate(`settings/users/${u.id}`)
                                      }
                                    >
                                      {t("View")}
                                    </Button>
                                    <Button
                                      size="compact-sm"
                                      variant="subtle"
                                      leftSection={<Building2 size={14} aria-hidden="true" />}
                                      onClick={() => {
                                        setAssigning(u);
                                        setUserBase(u.base?.code || "");
                                        setError("");
                                        setDialog("assign");
                                      }}
                                    >
                                      {t("Assign base")}
                                    </Button>
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            );
                          })()
                        : (() => {
                            const b = row as Base;
                            return (
                              <Table.Tr key={b.id}>
                                <Table.Td>
                                  <Group gap="xs" wrap="nowrap">
                                    <span className="settings-record-icon"><Building2 size={16} aria-hidden="true" /></span>
                                    <Text size="sm" fw={600} ff="monospace">{b.code}</Text>
                                  </Group>
                                </Table.Td>
                                <Table.Td>
                                  <Group gap="xs">
                                    <Button
                                      size="compact-sm"
                                      variant="subtle"
                                      leftSection={<Pencil size={14} aria-hidden="true" />}
                                      onClick={() => openBase(b)}
                                    >
                                      {t("Edit")}
                                    </Button>
                                    <Button
                                      size="compact-sm"
                                      color="red"
                                      variant="subtle"
                                      leftSection={<Trash2 size={14} aria-hidden="true" />}
                                      onClick={() => {
                                        setEditing(b);
                                        setError("");
                                        setDialog("delete");
                                      }}
                                    >
                                      {t("Delete")}
                                    </Button>
                                  </Group>
                                </Table.Td>
                              </Table.Tr>
                            );
                          })(),
                    )}
                  </Table.Tbody>
                </Table>
                {busy ? (
                  <Text p="md" role="status">
                    {t("Loading")}
                  </Text>
                ) : (
                  !error &&
                  rows.length === 0 && <Text p="md">{t("No results")}</Text>
                )}
              </Paper>
              <Group justify="space-between" className="settings-pagination">
                <Group gap="md">
                {!busy && !error && (
                <Text size="sm" c="dimmed" role="status">
                  {t("Results")}: {total}
                </Text>
              )}
                <Select
                  className="settings-page-size"
                  label={t("Rows per page")}
                  data={["10", "20", "30", "40", "50"]}
                  value={String(pageSize)}
                  onChange={(v) => change({ pageSize: v || "10" })}
                />
                </Group>
                <Pagination
                  aria-label={t("Pages")}
                  value={page}
                  total={Math.max(1, Math.ceil(total / pageSize))}
                  onChange={(v) => change({ page: String(v) }, false)}
                  disabled={busy}
                />
              </Group>
              </Stack>
            </Paper>
          )}
        </Stack>
      </div>
      <Modal
        opened={dialog !== null}
        onClose={() => {
          if (!saving) {
            setDialog(null);
            setPassword("");
            if (dialog === "user") onNavigate("settings/users");
          }
        }}
        title={t(
          dialog === "base"
            ? editing
              ? "Edit"
              : "Create base"
            : dialog === "user"
              ? "Create user"
              : dialog === "assign"
                ? "Assign base"
                : "Delete base?",
        )}
        centered
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Stack>
            {error && (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            )}
            {dialog === "base" && (
              <TextInput
                leftSection={<Building2 size={16} aria-hidden="true" />}
                required
                label={t("Base name (acronym)")}
                placeholder="JTY"
                error={fieldError("code")}
                maxLength={fieldLimits.code}
                value={code}
                onChange={(e) => setCode(e.currentTarget.value)}
              />
            )}
            {dialog === "user" && (
              <>
                <TextInput
                  leftSection={<UserRound size={16} aria-hidden="true" />}
                  required
                  label={t("Username")}
                  error={fieldError("username")}
                  maxLength={fieldLimits.username}
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                />
                <TextInput
                  leftSection={<UserRound size={16} aria-hidden="true" />}
                  required
                  label={t("Full name")}
                  error={fieldError("fullName")}
                  value={fullName}
                  onChange={(e) => setFullName(e.currentTarget.value)}
                />
                <TextInput
                  leftSection={<Mail size={16} aria-hidden="true" />}
                  required
                  type="email"
                  label={t("Email")}
                  error={fieldError("email")}
                  maxLength={fieldLimits.email}
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                />
                <Select
                  leftSection={<Building2 size={16} aria-hidden="true" />}
                  required
                  searchable
                  label={t("Base")}
                  data={acronymOptions}
                  value={userBase || null}
                  onSearchChange={setBaseSearch}
                  onChange={(v) => setUserBase(v || "")}
                />
                <PasswordInput
                  leftSection={<LockKeyhole size={16} aria-hidden="true" />}
                  required
                  label={t("Password")}
                  error={fieldError("password")}
                  autoComplete="new-password"
                  minLength={passwordMinLength}
                  maxLength={fieldLimits.password}
                  value={password}
                  onChange={(e) => setPassword(e.currentTarget.value)}
                />
              </>
            )}
            {dialog === "assign" && (
              <>
                <Text>{assigning?.username}</Text>
                <Select
                  leftSection={<Building2 size={16} aria-hidden="true" />}
                  required
                  searchable
                  label={t("Base")}
                  data={acronymOptions}
                  value={userBase || null}
                  onSearchChange={setBaseSearch}
                  onChange={(v) => setUserBase(v || "")}
                />
              </>
            )}
            {dialog === "delete" && (
              <Text>
                {editing?.code}.{" "}
                {t("Assigned bases cannot be deleted.")}
              </Text>
            )}
            <Group justify="end">
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  setDialog(null);
                  setPassword("");
                  if (dialog === "user") onNavigate("settings/users");
                }}
                disabled={saving}
              >
                {t("Cancel")}
              </Button>
              <Button
                type="submit"
                leftSection={dialog === "delete" ? <Trash2 size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
                color={dialog === "delete" ? "red" : undefined}
                loading={saving}
              >
                {t(dialog === "delete" ? "Delete" : "Save")}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Stack>
  );
}
