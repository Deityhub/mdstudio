// Single SQLite schema shared by Cloudflare D1 and self-hosted better-sqlite3.
// Authoritative table list: docs/SYSTEM_SPEC.md section 6. Timestamps are Unix milliseconds.
import { index, integer, sqliteTable, text, unique, uniqueIndex } from "drizzle-orm/sqlite-core";

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
  },
  (t) => [index("idx_documents_user_updated").on(t.userId, t.updatedAt)],
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
