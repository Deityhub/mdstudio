import { z } from "zod";

/** Every metadata field the AI can be asked to generate, in display order. */
export const METADATA_FIELD_IDS = [
  "title",
  "description",
  "tags",
  "summary",
  "category",
  "language",
  "status",
  "seoTitle",
  "excerpt",
] as const;
export type MetadataFieldId = (typeof METADATA_FIELD_IDS)[number];

/** Fields the AI generates by default when the metadata tab opens. */
export const DEFAULT_METADATA_FIELDS: MetadataFieldId[] = ["title", "description", "tags"];

export interface MetadataFieldDef {
  id: MetadataFieldId;
  label: string;
  hint: string;
  /** Selected by default when the metadata tab opens. */
  default: boolean;
  /** Which input renders the field's value. */
  input: "text" | "textarea" | "tags" | "select";
  rows?: number;
  options?: { value: string; label: string }[];
}

/** Human-readable label and input kind per supported field. */
export const METADATA_FIELDS: MetadataFieldDef[] = [
  {
    id: "title",
    label: "Title",
    hint: "H1-worthy title",
    default: true,
    input: "text",
  },
  {
    id: "description",
    label: "Description",
    hint: "Short page description",
    default: true,
    input: "textarea",
    rows: 2,
  },
  {
    id: "tags",
    label: "Tags",
    hint: "Lowercase, 3–6",
    default: true,
    input: "tags",
  },
  {
    id: "summary",
    label: "Summary",
    hint: "One-paragraph summary",
    default: false,
    input: "textarea",
    rows: 3,
  },
  {
    id: "category",
    label: "Category",
    hint: "Draft topic bucket",
    default: false,
    input: "text",
  },
  {
    id: "language",
    label: "Language",
    hint: "e.g. English",
    default: false,
    input: "text",
  },
  {
    id: "status",
    label: "Status",
    hint: "draft / published",
    default: false,
    input: "select",
    options: [
      { value: "draft", label: "Draft" },
      { value: "published", label: "Published" },
    ],
  },
  {
    id: "seoTitle",
    label: "SEO title",
    hint: "Search-optimized title",
    default: false,
    input: "text",
  },
  {
    id: "excerpt",
    label: "Excerpt",
    hint: "Search/social snippet",
    default: false,
    input: "textarea",
    rows: 2,
  },
];

/** What the AI is asked to produce for each selected field, for the system prompt. */
export const METADATA_FIELD_DESCRIPTIONS: Record<MetadataFieldId, string> = {
  title: "an accurate clear title",
  description: "a concise description",
  tags: "3–6 relevant lowercase tags",
  summary: "a one-paragraph summary",
  category: "a topic category",
  language: "the language of the draft",
  status: "a status: draft or published",
  seoTitle: "a search-optimized title",
  excerpt: "a search/social snippet",
};

export const writingRequestSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("metadata"),
    draft: z.string().trim().min(1).max(100000),
    /** Which fields the AI should generate. Defaults to title, description, tags. */
    fields: z.array(z.enum(METADATA_FIELD_IDS)).optional().default(DEFAULT_METADATA_FIELDS),
  }),
  z.object({
    mode: z.literal("write"),
    topic: z.string().trim().min(1).max(5000),
    notes: z.string().max(10000).default(""),
  }),
  z.object({
    mode: z.literal("edit"),
    /** What to do with the text, in the writer's words. */
    instruction: z.string().trim().min(1).max(1000),
    /** The selected Markdown, sent as data. */
    text: z.string().min(1).max(100000),
  }),
]);

/** Builds a zod schema that validates exactly the fields the AI was asked to generate. */
export function buildMetadataSchema(fields: MetadataFieldId[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    switch (field) {
      case "tags":
        shape[field] = z.array(z.string());
        break;
      case "status":
        shape[field] = z.enum(["draft", "published"]);
        break;
      default:
        shape[field] = z.string();
        break;
    }
  }
  return z.object(shape);
}

/**
 * Validated metadata values for exactly the fields the writer asked the AI to generate.
 * Unselected fields are never present here, so apply never writes a field the writer didn't request.
 */
export type SuggestedMetadata = Partial<Record<MetadataFieldId, string | string[]>>;
export type WritingRequest = z.infer<typeof writingRequestSchema>;
export type WritingEvent =
  | { type: "text" | "reasoning"; text: string }
  | { type: "metadata"; data: SuggestedMetadata }
  | { type: "done" }
  | { type: "error"; message: string };

export async function readWritingStream(
  response: Response,
  onEvent: (event: WritingEvent) => void,
) {
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: `AI request failed (${response.status}).` }));
    throw new Error(error.message ?? `AI request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The AI response was empty.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as WritingEvent;
    if (event.type === "error") throw new Error(event.message);
    if (event.type === "done") completed = true;
    onEvent(event);
  };
  try {
    while (true) {
      const chunk = await reader.read();
      pending += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(consume);
      if (chunk.done) break;
    }
    consume(pending);
    if (!completed)
      throw new Error("Generation was interrupted. Your partial draft has been kept.");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
