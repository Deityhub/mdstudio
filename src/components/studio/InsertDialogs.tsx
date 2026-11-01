import { useEffect, useRef, useState, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ImageValues, LinkValues } from "@/lib/editing-insert";

// Exported Markdown is read by other platforms, so refuse schemes that can run code.
const SCRIPT_URL = /^\s*(javascript|vbscript):/i;

const focusAfterClose = (returnFocus: () => void) => (e: Event) => {
  e.preventDefault();
  returnFocus();
};

const linkSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Enter a URL.")
    .refine((u) => !SCRIPT_URL.test(u) && !/^\s*data:/i.test(u), "That URL scheme isn't allowed."),
  text: z.string(),
  title: z.string(),
});

const imageSchema = z.object({
  alt: z.string().trim().min(1, "Describe the image: screen readers and search engines need it."),
  url: z.string().trim(),
  title: z.string(),
});

export type LinkDialogState = { text: string; url: string; title: string; editing: boolean };

export function LinkDialog({
  open,
  initial,
  onOpenChange,
  onSubmit,
  returnFocus,
}: {
  open: boolean;
  initial: LinkDialogState;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: LinkValues) => void;
  /** Called when the dialog closes so the editor can take focus back. */
  returnFocus: () => void;
}) {
  const closeFocus = focusAfterClose(returnFocus);
  const [values, setValues] = useState(initial);
  const [error, setError] = useState("");
  useEffect(() => {
    if (open) {
      setValues(initial);
      setError("");
    }
  }, [open, initial]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = linkSchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the link.");
    onSubmit(parsed.data);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={closeFocus}>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{initial.editing ? "Edit link" : "Insert link"}</DialogTitle>
            <DialogDescription>
              Links use standard Markdown, so they work everywhere.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              autoFocus
              value={values.url}
              placeholder="https://example.com"
              onChange={(e) => setValues({ ...values, url: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="link-text">Text</Label>
            <Input
              id="link-text"
              value={values.text}
              placeholder="Defaults to the selected text or the URL"
              onChange={(e) => setValues({ ...values, text: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="link-title">Title (optional)</Label>
            <Input
              id="link-title"
              value={values.title}
              onChange={(e) => setValues({ ...values, title: e.target.value })}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{initial.editing ? "Update link" : "Insert link"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type ImageSubmit = ImageValues & { file?: File };

export function ImageDialog({
  open,
  initialAlt,
  onOpenChange,
  onSubmit,
  returnFocus,
}: {
  open: boolean;
  initialAlt: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ImageSubmit) => void;
  returnFocus: () => void;
}) {
  const closeFocus = focusAfterClose(returnFocus);
  const [values, setValues] = useState({ alt: initialAlt, url: "", title: "" });
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setValues({ alt: initialAlt, url: "", title: "" });
      setFile(null);
      setError("");
    }
  }, [open, initialAlt]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = imageSchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Check the image.");
    if (!file && !parsed.data.url) return setError("Enter an image URL or choose a file.");
    if (!file && SCRIPT_URL.test(parsed.data.url))
      return setError("That URL scheme isn't allowed.");
    onSubmit(file ? { ...parsed.data, file } : parsed.data);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onCloseAutoFocus={closeFocus}>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Insert image</DialogTitle>
            <DialogDescription>
              Alt text is required so the image is usable with screen readers and search.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="image-alt">Alt text</Label>
            <Input
              id="image-alt"
              autoFocus
              value={values.alt}
              onChange={(e) => setValues({ ...values, alt: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="image-url">Image URL</Label>
            <Input
              id="image-url"
              value={values.url}
              disabled={!!file}
              placeholder="https://example.com/photo.jpg"
              onChange={(e) => setValues({ ...values, url: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => picker.current?.click()}
            >
              <Upload className="h-4 w-4" /> Upload from device
            </Button>
            <span className="min-w-0 truncate text-sm text-muted-foreground">
              {file ? file.name : "or paste a URL above"}
            </span>
            <input
              ref={picker}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="image-title">Title (optional)</Label>
            <Input
              id="image-title"
              value={values.title}
              onChange={(e) => setValues({ ...values, title: e.target.value })}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Insert image</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
