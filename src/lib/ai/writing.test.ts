import { describe, expect, it } from "vitest";
import { readWritingStream, writingRequestSchema } from "./writing";
import { joinFrontMatter, splitFrontMatter } from "../markdown/markdown";

describe("AI writing", () => {
  it("applies title, description and tags without changing the Markdown body or other metadata", () => {
    const body = "# Existing title\n\nOriginal **draft**.\n";
    const result = splitFrontMatter(
      joinFrontMatter(
        {
          date: "2026-10-31",
          title: "Clear title",
          description: "A clear description",
          tags: ["markdown", "writing"],
        },
        body,
      ),
    );
    expect(result.body).toBe("\n" + body);
    expect(result.data).toEqual({
      date: "2026-10-31",
      title: "Clear title",
      description: "A clear description",
      tags: ["markdown", "writing"],
    });
  });
  it("accepts draft input and topic writing, but rejects empty submissions", () => {
    expect(writingRequestSchema.parse({ mode: "metadata", draft: "# Draft" })).toEqual({
      mode: "metadata",
      draft: "# Draft",
    });
    expect(writingRequestSchema.parse({ mode: "write", topic: "Accessibility" })).toEqual({
      mode: "write",
      topic: "Accessibility",
      notes: "",
    });
    expect(writingRequestSchema.safeParse({ mode: "write", topic: " " }).success).toBe(false);
  });
  it("reads separately arriving reasoning and split text frames", async () => {
    const encoder = new TextEncoder();
    const frames = [
      '{"type":"reasoning","text":"Planning"}\n',
      '{"type":"text","text":"# ',
      'Draft"}\n{"type":"done"}\n',
    ];
    const events: unknown[] = [];
    const stream = new ReadableStream({
      pull(controller) {
        const frame = frames.shift();
        if (frame) controller.enqueue(encoder.encode(frame));
        else controller.close();
      },
    });
    await readWritingStream(new Response(stream), (event) => events.push(event));
    expect(events).toEqual([
      { type: "reasoning", text: "Planning" },
      { type: "text", text: "# Draft" },
      { type: "done" },
    ]);
  });
  it("surfaces terminal denial without replaying it", async () => {
    await expect(
      readWritingStream(
        Response.json({ message: "Provider access denied" }, { status: 403 }),
        () => {},
      ),
    ).rejects.toThrow("Provider access denied");
  });
  it("reports an interrupted response instead of treating it as complete", async () => {
    await expect(
      readWritingStream(new Response('{"type":"text","text":"Partial"}\n'), () => {}),
    ).rejects.toThrow("interrupted");
  });
});
