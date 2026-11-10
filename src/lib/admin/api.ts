// Browser side of /api/admin/*. Every call is for a signed-in admin; anyone else gets a 404.
import { call } from "@/lib/sync/api";

export type LimitValue = number | boolean;
export type LimitSource = "override" | "plan" | "server" | "env" | "default";
export type LimitRow = { value: LimitValue; source: LimitSource };
/** What the page needs to draw a limit control: its type and what applies when nothing sets it. */
export type LimitCatalog = Record<
  string,
  { type: "number" | "boolean"; base: LimitValue; baseSource: LimitSource }
>;

export type Overview = {
  accounts: number;
  admins: number;
  suspended: number;
  unverified: number;
  newThisWeek: number;
  drafts: number;
  shares: number;
  images: number;
  imageBytes: number;
  integrations: number;
};
export type UserRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  plan: string;
  suspended: boolean;
  emailVerified: boolean;
  createdAt: number;
  drafts: number;
};
export type UserDetail = {
  account: UserRow & { suspendedAt: number | null; hasPassword: boolean };
  limits: Record<string, LimitRow>;
  plans: string[];
  catalog: LimitCatalog;
  usage: {
    drafts: number;
    shares: number;
    images: number;
    imageBytes: number;
    integrations: number;
    sessions: number;
    github: string | null;
  };
};
export type UserContent = {
  drafts: { id: string; title: string; bytes: number; updatedAt: number }[];
  shares: {
    id: string;
    slug: string;
    title: string;
    access: string;
    expiresAt: number | null;
    live: boolean;
  }[];
  images: { id: string; fileName: string; bytes: number; createdAt: number }[];
};
export type Plan = { name: string; label: string; limits: Record<string, LimitValue> };
export type Settings = {
  limits: Record<string, LimitValue>;
  signupsOpen: boolean;
  notice: string | null;
};
export type AuditEntry = {
  id: string;
  at: number;
  actorEmail: string;
  action: string;
  targetEmail: string | null;
  detail: unknown;
};
export type Page<T> = { total: number; page: number; pageSize: number } & T;

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined && {
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }),
});
const id = encodeURIComponent;

export const adminApi = {
  overview: () => call<{ overview: Overview }>("/api/admin/overview").then((r) => r.overview),
  users: (q: string, page: number) =>
    call<Page<{ users: UserRow[] }>>(`/api/admin/users?q=${id(q)}&page=${page}`),
  user: (userId: string) => call<UserDetail>(`/api/admin/users/${id(userId)}`),
  updateUser: (userId: string, change: Record<string, unknown>) =>
    call<UserDetail>(`/api/admin/users/${id(userId)}`, send("PATCH", change)),
  deleteUser: (userId: string) => call(`/api/admin/users/${id(userId)}`, send("DELETE")),
  signOut: (userId: string) =>
    call<{ ended: number }>(`/api/admin/users/${id(userId)}/sign-out`, send("POST")),
  content: (userId: string) => call<UserContent>(`/api/admin/users/${id(userId)}/content`),
  removeContent: (userId: string, kind: "shares" | "images" | "drafts", item: string) =>
    call(`/api/admin/users/${id(userId)}/${kind}/${id(item)}`, send("DELETE")),
  plans: () => call<{ plans: Plan[]; catalog: LimitCatalog }>("/api/admin/plans"),
  savePlan: (plan: Plan) => call<{ plans: Plan[] }>("/api/admin/plans", send("PUT", plan)),
  deletePlan: (name: string) => call(`/api/admin/plans/${id(name)}`, send("DELETE")),
  settings: () => call<{ settings: Settings; catalog: LimitCatalog }>("/api/admin/settings"),
  updateSettings: (change: Record<string, unknown>) =>
    call<{ settings: Settings; catalog: LimitCatalog }>(
      "/api/admin/settings",
      send("PATCH", change),
    ),
  audit: (page: number) => call<Page<{ entries: AuditEntry[] }>>(`/api/admin/audit?page=${page}`),
};
