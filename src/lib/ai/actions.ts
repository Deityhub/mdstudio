/** The ready-made things a writer can ask for on selected text, plus a free-form one. */
export const AI_ACTIONS = [
  {
    id: "improve",
    label: "Improve writing",
    instruction: "Improve the clarity, flow and word choice. Keep the meaning and the voice.",
  },
  {
    id: "proofread",
    label: "Fix spelling and grammar",
    instruction: "Fix spelling, grammar and punctuation only. Change nothing else.",
  },
  {
    id: "shorten",
    label: "Make shorter",
    instruction: "Make it shorter and tighter without losing the key points.",
  },
  {
    id: "expand",
    label: "Make longer",
    instruction:
      "Expand it with more detail and explanation. Do not invent facts, quotes or statistics.",
  },
  { id: "summarize", label: "Summarize", instruction: "Summarize it in a few sentences." },
  {
    id: "translate",
    label: "Translate",
    instruction: "Translate it into {input}.",
    needs: "language",
  },
  { id: "custom", label: "Custom instruction", instruction: "{input}", needs: "instruction" },
] as const;

export type AiActionId = (typeof AI_ACTIONS)[number]["id"];

/** The instruction to send, or null when the action needs a language or text and none was given. */
export function actionInstruction(id: AiActionId, input: string): string | null {
  const action = AI_ACTIONS.find((a) => a.id === id);
  if (!action) return null;
  const value = input.trim();
  if ("needs" in action && !value) return null;
  return action.instruction.replace("{input}", value);
}

const FENCE = /^```[\w-]*\n([\s\S]*?)\n?```\s*$/;

/**
 * Tidies a model's answer for putting back where the selection was: drops an outer code fence the
 * model added (unless the selection itself was one) and keeps the selection's own leading and
 * trailing whitespace, so only its words change.
 */
export function cleanEdit(result: string, original: string): string {
  let text = result.trim();
  const fenced = FENCE.exec(text);
  if (fenced && !original.trimStart().startsWith("```")) text = fenced[1]!.trim();
  const lead = /^\s*/.exec(original)![0];
  const trail = /\s*$/.exec(original.slice(lead.length))![0];
  return lead + text + trail;
}
