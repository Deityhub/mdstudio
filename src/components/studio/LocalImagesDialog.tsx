import { ImageUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImageNote } from "@/lib/collab/images";

/**
 * Says which images of a draft edited together are not shared (only one browser has them), why that
 * matters, and what to do: host them, or use an image address. The other people see a broken picture.
 */
export function LocalImagesDialog({
  note,
  names,
  onClose,
  onHost,
}: {
  note: ImageNote | null;
  names: string[];
  onClose: () => void;
  /** Present where images can be hosted: uploads them and points the text at the hosted copies. */
  onHost?: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  if (!note) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{note.label[0]!.toUpperCase() + note.label.slice(1)}</DialogTitle>
          <DialogDescription>{note.advice}</DialogDescription>
        </DialogHeader>
        <ul aria-label="Images" className="grid max-w-full max-h-40 gap-1 overflow-y-auto text-sm">
          {names.map((n) => (
            <li key={n} className="max-w-full truncate rounded border border-border px-2 py-1">
              {n}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Close
          </Button>
          {note.canHost && onHost && (
            <Button
              type="button"
              loading={busy}
              onClick={() => {
                setBusy(true);
                void onHost().finally(() => {
                  setBusy(false);
                  onClose();
                });
              }}
            >
              <ImageUp /> Host these images
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
