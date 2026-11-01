import { z } from "zod";

export const writingRequestSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("metadata"), draft: z.string().trim().min(1).max(100000) }),
  z.object({
    mode: z.literal("write"),
    topic: z.string().trim().min(1).max(5000),
    notes: z.string().max(10000).default(""),
  }),
]);
export const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
});
export type SuggestedMetadata = z.infer<typeof metadataSchema>;
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
