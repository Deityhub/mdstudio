// Single SQLite schema shared by Cloudflare D1 and self-hosted better-sqlite3.
// Authoritative table list: docs/SYSTEM_SPEC.md section 6. Timestamps are Unix milliseconds.
import { index, integer, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

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

/** One-time links that confirm an email address. Only a hash of the token is stored. */
export const emailTokens = sqliteTable("email_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
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
    content: text("content").notNull(),
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

export const shareLinks = sqliteTable("share_links", {
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
});
