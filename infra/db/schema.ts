// Single SQLite schema shared by Cloudflare D1 and self-hosted better-sqlite3.
// Authoritative table list: docs/SYSTEM_SPEC.md section 6. Timestamps are Unix milliseconds.
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  // The same inbox under every spelling (plus tags, Gmail dots), so one inbox is one account.
  emailKey: text("email_key").unique(),
  // When the address was confirmed by a link in an email (or by GitHub, which verifies its own).
  emailVerifiedAt: integer("email_verified_at"),
  passwordHash: text("password_hash"),
  displayName: text("display_name"),
  avatarUrl: text("avatar_url"),
  // Which set of limits applies (see src/server/limits/catalog.ts). Everyone is on "free" today.
  plan: text("plan").notNull().default("free"),
  // Limits set for this account alone, on top of its plan: one JSON object of limit key to number or
  // true/false ("{}" for none). Kept here, not in a table of its own: the row is read at sign-in anyway.
  limits: text("limits").notNull().default("{}"),
  // "admin" can use the admin dashboard; everyone else is "user". The first account ever created
  // is the admin; after that it is changed in the dashboard or with SQL.
  role: text("role").notNull().default("user"),
  // When an admin suspended the account (it cannot sign in or use the cloud); NULL when active.
  suspendedAt: integer("suspended_at"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** One-time links sent by email: confirming the address, or resetting the password. Only a hash of the token is stored. */
export const emailTokens = sqliteTable("email_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  // What the link is for: confirming the address ("verify") or choosing a new password ("reset").
  purpose: text("purpose").notNull().default("verify"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

/** Fixed-window counters behind the sign-up, sign-in and email limits. */
export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetsAt: integer("resets_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const oauthAccounts = sqliteTable(
  "oauth_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerUserId: text("provider_user_id").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [unique().on(t.provider, t.providerUserId)],
);

/** A writer's GitHub connection for publishing. The token is sealed (see src/server/github/crypto.ts). */
export const githubConnections = sqliteTable("github_connections", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  githubUserId: text("github_user_id").notNull(),
  login: text("login").notNull(),
  /** The scopes GitHub granted, space separated. */
  scope: text("scope").notNull(),
  tokenSealed: text("token_sealed").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/** Where a cloud draft was last published on GitHub, one row per kind (file or gist). */
export const githubPublications = sqliteTable(
  "github_publications",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull(),
    kind: text("kind").notNull(),
    repo: text("repo"),
    branch: text("branch"),
    path: text("path"),
    gistId: text("gist_id"),
    /** The file's blob id at the last commit made from this draft, to notice later changes on GitHub. */
    fileSha: text("file_sha"),
    commitSha: text("commit_sha"),
    url: text("url").notNull(),
    contentHash: text("content_hash").notNull(),
    publishedAt: integer("published_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("github_publications_document_kind").on(t.documentId, t.kind)],
);

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    // Library label and folder, as in the browser's draft (src/lib/storage/documentStore.ts).
    name: text("name"),
    folder: text("folder"),
    content: text("content").notNull().default(""),
    version: integer("version").notNull().default(1),
    contentHash: text("content_hash").notNull(),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    // When the text was last edited on a device; the later edit wins a sync conflict.
    editedAt: integer("edited_at").notNull().default(0),
    deletedAt: integer("deleted_at"),
    // 1 while the draft is edited live with other people: its text then lives in a room (see
    // src/server/collab), and this column holds a copy that is refreshed from it.
    collab: integer("collab").notNull().default(0),
  },
  (t) => [index("idx_documents_user_updated").on(t.userId, t.updatedAt)],
);

/** People the owner invited to edit a draft together, by address (they may not have an account yet). */
export const documentEditors = sqliteTable(
  "document_editors",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    emailKey: text("email_key").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("document_editors_doc_email").on(t.documentId, t.emailKey),
    index("idx_document_editors_email").on(t.emailKey),
  ],
);

/**
 * A live room's state on a self-hosted server: a snapshot and the updates since (base64). Hosted,
 * rooms keep this in their Durable Object instead, and these tables stay empty.
 */
export const collabSnapshots = sqliteTable("collab_snapshots", {
  documentId: text("document_id").primaryKey(),
  data: text("data").notNull(),
});
export const collabUpdates = sqliteTable(
  "collab_updates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    documentId: text("document_id").notNull(),
    data: text("data").notNull(),
  },
  (t) => [index("idx_collab_updates_doc").on(t.documentId)],
);

export const documentRevisions = sqliteTable(
  "document_revisions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    // The text, or its gzip as base64 when `encoding` says so (compressed only when smaller).
    content: text("content").notNull(),
    encoding: text("encoding").notNull().default("plain"),
    // Size of the text itself, so a list can show it without unpacking anything.
    size: integer("size").notNull().default(0),
    // Hash of the text, so an unchanged text is never kept twice in a row.
    hash: text("hash").notNull().default(""),
    // "auto" for the periodic version, "replaced" for text a newer edit from another device took over.
    reason: text("reason").notNull().default("auto"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("idx_revisions_doc_version").on(t.documentId, t.version)],
);

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    documentId: text("document_id").references(() => documents.id, { onDelete: "set null" }),
    storageKey: text("storage_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    byteSize: integer("byte_size").notNull(),
    sha256: text("sha256").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  // The same picture uploaded twice by one account is stored once.
  (t) => [unique().on(t.userId, t.sha256)],
);

// A public, read-only page for one cloud draft. It holds its own published copy (title and
// content), which changes only when the writer publishes an update; the draft itself can move on.
// One link per draft, and every link expires (expires_at is always set by the server code).
export const shareLinks = sqliteTable(
  "share_links",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    revisionId: text("revision_id").references(() => documentRevisions.id, {
      onDelete: "set null",
    }),
    slug: text("slug").notNull().unique(),
    isPublic: integer("is_public").notNull().default(1),
    viewCount: integer("view_count").notNull().default(0),
    expiresAt: integer("expires_at"),
    createdAt: integer("created_at").notNull(),
    title: text("title").notNull().default(""),
    content: text("content").notNull().default(""),
    publishedAt: integer("published_at").notNull().default(0),
    updatedAt: integer("updated_at").notNull().default(0),
    // who may open it: "public" (anyone with the link) or "people" (the named people, signed in)
    access: text("access").notNull().default("public"),
    // whether signed-in readers may comment on the published copy
    comments: integer("comments").notNull().default(0),
  },
  (t) => [uniqueIndex("share_links_document_unique").on(t.documentId)],
);

/** People invited to a private link, by the inbox their address stands for. */
export const sharePeople = sqliteTable(
  "share_people",
  {
    id: text("id").primaryKey(),
    shareId: text("share_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    emailKey: text("email_key").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("share_people_inbox_unique").on(t.shareId, t.emailKey)],
);

/** A reviewer's comment on a block of a published copy (one level of replies via parent_id). */
export const shareComments = sqliteTable(
  "share_comments",
  {
    id: text("id").primaryKey(),
    shareId: text("share_id")
      .notNull()
      .references(() => shareLinks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    // the published copy it was written on (share_links.published_at at the time), the block's
    // source line and the start of its text, to find the block again after an update
    version: integer("version").notNull(),
    line: integer("line").notNull(),
    snippet: text("snippet").notNull().default(""),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (t) => [index("idx_share_comments_share").on(t.shareId, t.createdAt)],
);

/**
 * An AI integration kept in an account: which service, its endpoint and the models to offer. The API
 * key is deliberately not here; keys stay in the browser's memory. `id` is `<userId>:<local id>`.
 */
export const aiIntegrations = sqliteTable(
  "ai_integrations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    provider: text("provider").notNull(),
    baseUrl: text("base_url").notNull(),
    /** JSON array of model ids. */
    models: text("models").notNull().default("[]"),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("idx_ai_integrations_user").on(t.userId)],
);

/** Plans an admin defines: a name, a label and the limits it changes (JSON). "free" always exists. */
export const plans = sqliteTable("plans", {
  name: text("name").primaryKey(),
  label: text("label").notNull(),
  limits: text("limits").notNull().default("{}"),
  updatedAt: integer("updated_at").notNull(),
});

/** Server-wide settings an admin changes in the dashboard: default limits, sign-ups, the site notice. */
export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  /** JSON. */
  value: text("value").notNull(),
});

/** What admins did, newest last. The actor and target are kept as text so entries outlive accounts. */
export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: integer("at").notNull(),
    actorId: text("actor_id").notNull(),
    actorEmail: text("actor_email").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    targetEmail: text("target_email"),
    /** JSON with the change. */
    detail: text("detail").notNull().default("{}"),
  },
  (t) => [index("idx_audit_at").on(t.at)],
);
