import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MAX_BODY, MAX_SELECTION } from "@/lib/collab/thread-rules";

export type Composing = { kind: "comment" | "suggestion"; from: number; to: number; text: string };

const WHY: Record<string, string> = {
  empty: "Write something first.",
  too_long: `Keep it under ${MAX_BODY} characters.`,
  no_selection: `Select some words (up to ${MAX_SELECTION} characters) first.`,
  full: "This draft has as many comments as it can hold. Resolve or delete some first.",
};

/** Writes a comment on the selected words, or a suggested replacement for them. */
export function ThreadDialog({
  composing,
  onClose,
  onSubmit,
}: {
  composing: Composing | null;
  onClose: () => void;
  /** Returns the reason it was refused, or nothing when it was made. */
  onSubmit: (c: Composing, body: string, proposed: string) => string | undefined;
}) {
  const [body, setBody] = useState("");
  const [proposed, setProposed] = useState("");
  const [problem, setProblem] = useState("");
  useEffect(() => {
    setBody("");
    setProposed(composing?.text ?? "");
    setProblem("");
  }, [composing]);
  if (!composing) return null;
  const suggestion = composing.kind === "suggestion";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const error = onSubmit(composing, body, proposed);
            if (error) setProblem(WHY[error] ?? "That didn't work.");
            else onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{suggestion ? "Suggest an edit" : "Comment on the selection"}</DialogTitle>
            <DialogDescription className="line-clamp-3 whitespace-pre-wrap wrap-break-word">
              “{composing.text}”
            </DialogDescription>
          </DialogHeader>
          {suggestion && (
            <div className="grid gap-1.5">
              <Label htmlFor="suggest-text">Replace these words with</Label>
              <Textarea
                id="suggest-text"
                rows={3}
                maxLength={MAX_BODY}
                value={proposed}
                autoFocus
                onChange={(e) => setProposed(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave it empty to suggest deleting them.
              </p>
            </div>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="thread-body">{suggestion ? "Why (optional)" : "Your comment"}</Label>
            <Textarea
              id="thread-body"
              rows={3}
              maxLength={MAX_BODY}
              value={body}
              autoFocus={!suggestion}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          {problem && (
            <p role="alert" className="text-sm text-destructive">
              {problem}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">{suggestion ? "Suggest" : "Comment"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
