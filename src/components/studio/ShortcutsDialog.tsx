import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Mirrors the keymap in MarkdownEditor.tsx. "Mod" is Ctrl on Windows/Linux and ⌘ on Mac.
const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: "Text",
    items: [
      ["Ctrl/⌘ B", "Bold"],
      ["Ctrl/⌘ I", "Italic"],
      ["Ctrl/⌘ E", "Inline code"],
      ["Ctrl/⌘ Shift X", "Strikethrough"],
      ["Ctrl/⌘ Shift H", "Highlight"],
      ["Ctrl/⌘ K", "Link (edits the link under the cursor)"],
      ["Ctrl/⌘ Alt 0–6", "Paragraph, Heading 1–6"],
    ],
  },
  {
    group: "Blocks",
    items: [
      ["Ctrl/⌘ Shift 7", "Numbered list"],
      ["Ctrl/⌘ Shift 8", "Bulleted list"],
      ["Ctrl/⌘ Shift L", "Task list"],
      ["Ctrl/⌘ Shift .", "Quote"],
      ["Tab / Shift Tab", "Nest or outdent a list item, or move between table cells"],
      ["Enter", "Continue a list or quote"],
    ],
  },
  {
    group: "Editor",
    items: [
      ["Ctrl/⌘ F", "Search"],
      ["Ctrl/⌘ Z / Shift Z", "Undo / redo"],
      ["Ctrl/⌘ /", "Show this list"],
      ["Alt F10", "Move focus to the toolbar (arrows to move, Esc to return)"],
    ],
  },
];

export function ShortcutsDialog({
  open,
  onOpenChange,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnFocus: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100dvh-1rem)] overflow-y-auto"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Ctrl on Windows and Linux, ⌘ on Mac.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {SHORTCUTS.map((g) => (
            <section key={g.group}>
              <h3 className="mb-1 font-display text-sm font-semibold">{g.group}</h3>
              <dl className="divide-y divide-border rounded-md border border-border text-sm">
                {g.items.map(([keys, what]) => (
                  <div key={keys} className="flex items-baseline justify-between gap-4 px-3 py-1.5">
                    <dt className="text-muted-foreground">{what}</dt>
                    <dd className="shrink-0 font-mono text-xs">{keys}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
