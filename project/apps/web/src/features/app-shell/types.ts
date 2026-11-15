export type View =
  | "workspace"
  | "history"
  | "vocabulary"
  | "notifications"
  | "changelog"
  | "profile"
  | "settings/users"
  | "settings/users/new"
  | `settings/users/${string}`
  | "settings/bases"
  | "settings/files"
  | "settings/authentication";
