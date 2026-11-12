import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  Pagination,
  Paper,
  PasswordInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { Settings, Users, Building2 } from "lucide-react";
import type { View } from "../app-shell/types";
import { useLocale } from "../shared/LocaleProvider";
import AdminKeycloakSettings from "../profile/AdminKeycloakSettings";
import { management, type Base, type User } from "./api";
import UserDetailPage from "./UserDetailPage";
import {
  fieldLimits,
  passwordMinLength,
  validateManagementField,
  type ManagementField,
} from "./validation";
import "./system-settings.css";

type Section = "settings/users" | "settings/bases" | "settings/authentication";
type Props = {
  token: string;
  section: string;
  search: string;
  onNavigate: (view: View, page?: number, params?: URLSearchParams) => void;
};
const labels = {
  ja: {
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
    Search: "検索",
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
    Username: "ユーザー名",
    Email: "メールアドレス",
    Base: "拠点",
    Enabled: "有効",
    Password: "パスワード",
    Actions: "操作",
    All: "すべて",
    Yes: "はい",
    No: "いいえ",
    "No results": "結果がありません",
    Loading: "読み込み中",
    "Rows per page": "表示件数",
    "Delete base?": "拠点を削除しますか？",
    "Assigned bases cannot be deleted.":
      "ユーザーが所属する拠点は削除できません。",
  },
  zh: {
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
    Search: "搜索",
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
    Username: "用户名",
    Email: "电子邮件",
    Base: "据点",
    Enabled: "启用",
    Password: "密码",
    Actions: "操作",
    All: "全部",
    Yes: "是",
    No: "否",
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
    "Password must contain 12 to 128 characters.":
      "パスワードは12～128文字で入力してください。",
    "Use ASCII letters, digits, underscore or hyphen.":
      "半角英数字、アンダースコア、ハイフンを使用してください。",
    "Enter a valid email address.": "有効なメールアドレスを入力してください。",
    ...Object.fromEntries(
      [32, 64, 100, 254].map((max) => [
        `Enter 1 to ${max} characters.`,
        `1～${max}文字で入力してください。`,
      ]),
    ),
  },
  zh: {
    "GID cannot contain control characters.": "GID不能包含控制字符。",
    "Password must contain 12 to 128 characters.":
      "密码长度必须为12至128个字符。",
    "Use ASCII letters, digits, underscore or hyphen.":
      "请使用ASCII字母、数字、下划线或连字符。",
    "Enter a valid email address.": "请输入有效的电子邮件地址。",
    ...Object.fromEntries(
      [32, 64, 100, 254].map((max) => [
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
      : ["gid", "username", "email", "base", "enabled"];
  const sort = allowedSort.includes(params.get("sort") || "")
    ? params.get("sort")!
    : selected === "settings/bases"
      ? "code"
      : "username";
  const direction = params.get("direction") === "desc" ? "desc" : "asc";
  const rawBaseId = params.get("baseId") || "";
  const baseId =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      rawBaseId,
    )
      ? rawBaseId
      : "";
  const enabled = ["true", "false"].includes(params.get("enabled") || "")
    ? params.get("enabled")!
    : "";
  const [term, setTerm] = useState(q);
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
  const [name, setName] = useState("");
  const [gid, setGid] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [userBase, setUserBase] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const fieldValues = { gid, username, email, code, name, password };
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
    if (selected === "settings/authentication" || detailId) return;
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
    if (selected === "settings/users") {
      if (baseId) query.set("baseId", baseId);
      if (enabled) query.set("enabled", enabled);
    }
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
    baseId,
    enabled,
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
    Object.entries(updates).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (reset) next.delete("page");
    onNavigate(selected, undefined, next);
  };
  const openBase = (base?: Base) => {
    setEditing(base || null);
    setCode(base?.code || "");
    setName(base?.name || "");
    setError("");
    setDialog("base");
  };
  const openUser = () => {
    setGid("");
    setUsername("");
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
        ? ["code", "name"]
        : dialog === "user"
          ? ["gid", "username", "email", "password"]
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
          { code: code.trim(), name: name.trim() },
          editing?.id,
        );
      if (dialog === "delete" && editing)
        await management.deleteBase(token, editing.id);
      if (dialog === "user")
        await management.createUser(token, {
          gid: gid.trim(),
          username: username.trim(),
          email: email.trim(),
          baseId: userBase,
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
  const selectedBaseIds = [baseId, userBase].filter(Boolean);
  const optionBases = [
    ...new Map(
      [
        ...bases,
        ...knownBases.filter((base) => selectedBaseIds.includes(base.id)),
      ].map((base) => [base.id, base]),
    ).values(),
  ];
  const baseOptions = optionBases.map((base) => ({
    value: base.id,
    label: `${base.code} \u2014 ${base.name}`,
  }));
  for (const id of selectedBaseIds)
    if (!baseOptions.some((option) => option.value === id))
      baseOptions.push({ value: id, label: id });
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
        variant="subtle"
        size="compact-sm"
        onClick={() =>
          change({
            sort: key,
            direction: sort === key && direction === "asc" ? "desc" : "asc",
          })
        }
      >
        {t(title)}
        {sort === key ? (direction === "asc" ? " ▲" : " ▼") : ""}
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
    <Stack gap="md">
      <Text component="h1" fz="h2" fw={700}>
        {t("System Settings")}
      </Text>
      <div className="system-settings-layout">
        <nav className="system-settings-nav" aria-label={t("System Settings")}>
          {(
            [
              { id: "settings/users", label: "Users", Icon: Users },
              { id: "settings/bases", label: "Bases", Icon: Building2 },
              {
                id: "settings/authentication",
                label: "Authentication",
                Icon: Settings,
              },
            ] as const
          ).map(({ id, label, Icon }) => (
            <Button
              key={id}
              variant={selected === id ? "filled" : "subtle"}
              aria-current={selected === id ? "page" : undefined}
              leftSection={<Icon size={16} />}
              onClick={() => onNavigate(id)}
            >
              {t(label)}
            </Button>
          ))}
        </nav>
        <Stack className="system-settings-content" gap="md">
          {selected === "settings/authentication" ? (
            <AdminKeycloakSettings token={token} />
          ) : (
            <>
              <Group justify="space-between">
                <Text component="h2" fz="xl" fw={700}>
                  {t(selected === "settings/users" ? "Users" : "Bases")}
                </Text>
                <Button
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
                onSubmit={(event) => {
                  event.preventDefault();
                  change({ q: term.trim() });
                }}
              >
                <Group align="end">
                  <TextInput
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
                  <Button type="submit" variant="default">
                    {t("Search")}
                  </Button>
                  {selected === "settings/users" && (
                    <>
                      <Select
                        label={t("Base")}
                        searchable
                        clearable
                        data={baseOptions}
                        value={baseId || null}
                        onSearchChange={setBaseSearch}
                        onChange={(v) => change({ baseId: v || "" })}
                      />
                      <Select
                        label={t("Enabled")}
                        clearable
                        data={[
                          { value: "true", label: t("Yes") },
                          { value: "false", label: t("No") },
                        ]}
                        value={enabled || null}
                        onChange={(v) => change({ enabled: v || "" })}
                      />
                    </>
                  )}
                </Group>
              </form>
              {notice && !dialog && (
                <Alert
                  color="green"
                  role="status"
                  withCloseButton
                  onClose={() => setNotice("")}
                >
                  {notice}
                </Alert>
              )}
              {error && !dialog && (
                <Alert color="red" role="alert">
                  {error}
                </Alert>
              )}
              <Paper withBorder style={{ overflowX: "auto" }}>
                <Table miw={selected === "settings/users" ? 760 : 480}>
                  <Table.Thead>
                    <Table.Tr>
                      {selected === "settings/users" ? (
                        <>
                          {column("gid", "GID")}
                          {column("username", "Username")}
                          {column("email", "Email")}
                          {column("base", "Base")}
                          {column("enabled", "Enabled")}
                          <Table.Th>{t("Actions")}</Table.Th>
                        </>
                      ) : (
                        <>
                          {column("code", "Code")}
                          {column("name", "Name")}
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
                                <Table.Td>{u.gid || "—"}</Table.Td>
                                <Table.Td>{u.username}</Table.Td>
                                <Table.Td>{u.email || "—"}</Table.Td>
                                <Table.Td>
                                  {u.base
                                    ? `${u.base.code} — ${u.base.name}`
                                    : "—"}
                                </Table.Td>
                                <Table.Td>
                                  {t(u.enabled ? "Yes" : "No")}
                                </Table.Td>
                                <Table.Td>
                                  <Group gap="xs">
                                    <Button
                                      size="compact-sm"
                                      variant="subtle"
                                      onClick={() =>
                                        onNavigate(`settings/users/${u.id}`)
                                      }
                                    >
                                      {t("View")}
                                    </Button>
                                    <Button
                                      size="compact-sm"
                                      variant="subtle"
                                      onClick={() => {
                                        setAssigning(u);
                                        setUserBase(u.baseId || "");
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
                                <Table.Td>{b.code}</Table.Td>
                                <Table.Td>{b.name}</Table.Td>
                                <Table.Td>
                                  <Group gap="xs">
                                    <Button
                                      size="compact-sm"
                                      variant="subtle"
                                      onClick={() => openBase(b)}
                                    >
                                      {t("Edit")}
                                    </Button>
                                    <Button
                                      size="compact-sm"
                                      color="red"
                                      variant="subtle"
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
              {!busy && !error && (
                <Text size="sm" role="status">
                  {t("Results")}: {total}
                </Text>
              )}
              <Group justify="space-between">
                <Select
                  label={t("Rows per page")}
                  data={["10", "20", "30", "40", "50"]}
                  value={String(pageSize)}
                  onChange={(v) => change({ pageSize: v || "10" })}
                />
                <Pagination
                  aria-label={t("Pages")}
                  value={page}
                  total={Math.max(1, Math.ceil(total / pageSize))}
                  onChange={(v) => change({ page: String(v) }, false)}
                  disabled={busy}
                />
              </Group>
            </>
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
              <>
                <TextInput
                  required
                  label={t("Code")}
                  error={fieldError("code")}
                  maxLength={fieldLimits.code}
                  value={code}
                  onChange={(e) => setCode(e.currentTarget.value)}
                />
                <TextInput
                  required
                  label={t("Name")}
                  error={fieldError("name")}
                  maxLength={fieldLimits.name}
                  value={name}
                  onChange={(e) => setName(e.currentTarget.value)}
                />
              </>
            )}
            {dialog === "user" && (
              <>
                <TextInput
                  required
                  label="GID"
                  error={fieldError("gid")}
                  maxLength={fieldLimits.gid}
                  value={gid}
                  onChange={(e) => setGid(e.currentTarget.value)}
                />
                <TextInput
                  required
                  label={t("Username")}
                  error={fieldError("username")}
                  maxLength={fieldLimits.username}
                  value={username}
                  onChange={(e) => setUsername(e.currentTarget.value)}
                />
                <TextInput
                  required
                  type="email"
                  label={t("Email")}
                  error={fieldError("email")}
                  maxLength={fieldLimits.email}
                  value={email}
                  onChange={(e) => setEmail(e.currentTarget.value)}
                />
                <Select
                  required
                  searchable
                  label={t("Base")}
                  data={baseOptions}
                  value={userBase || null}
                  onSearchChange={setBaseSearch}
                  onChange={(v) => setUserBase(v || "")}
                />
                <PasswordInput
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
                  required
                  searchable
                  label={t("Base")}
                  data={baseOptions}
                  value={userBase || null}
                  onSearchChange={setBaseSearch}
                  onChange={(v) => setUserBase(v || "")}
                />
              </>
            )}
            {dialog === "delete" && (
              <Text>
                {editing?.code} — {editing?.name}.{" "}
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
