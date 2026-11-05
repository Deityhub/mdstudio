import { Copy, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type HostedImage, type ImageUsage, deleteImage, listImages } from "@/lib/account/assets";

const kb = (bytes: number) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

/** The account's hosted images: copy a link, or delete one (its links stop working). */
export function ManageImages({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<{ assets: HostedImage[]; usage: ImageUsage } | null>(null);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    const next = await listImages();
    setFailed(!next);
    if (next) setData(next);
  }, []);
  useEffect(() => {
    if (open) {
      setConfirming(null);
      void load();
    }
  }, [open, load]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Your hosted images</DialogTitle>
          <DialogDescription>
            Images you add to cloud drafts are stored here and linked by address, so they keep
            working wherever you publish the Markdown. They stay until you delete them.
          </DialogDescription>
        </DialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load your images. Check your connection and try again.
          </p>
        )}
        {data && (
          <>
            <p className="text-sm text-muted-foreground" data-testid="image-usage">
              {data.usage.count} of {data.usage.maxAssets} images ·{" "}
              {(data.usage.bytes / 1_000_000).toFixed(1)} of{" "}
              {(data.usage.maxBytes / 1_000_000).toFixed(0)} MB
            </p>
            <ul className="max-h-80 space-y-2 overflow-y-auto" aria-label="Hosted images">
              {data.assets.length === 0 && (
                <li className="text-sm text-muted-foreground">
                  No images yet. Paste or drop one into a draft that is stored in your cloud.
                </li>
              )}
              {data.assets.map((a) => (
                <li key={a.id} className="flex items-center gap-3 rounded border border-border p-2">
                  <img
                    src={a.url}
                    alt=""
                    className="size-12 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.fileName}</div>
                    <div className="text-xs text-muted-foreground">
                      {kb(a.byteSize)} · {new Date(a.createdAt).toLocaleDateString()}
                    </div>
                    {confirming === a.id && (
                      <p className="mt-1 text-xs text-destructive">
                        Posts that link to this image will stop showing it.
                      </p>
                    )}
                  </div>
                  {confirming === a.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          setConfirming(null);
                          if (await deleteImage(a.id)) toast.success("Image deleted");
                          else toast.error("Couldn't delete the image");
                          await load();
                        }}
                      >
                        Delete
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirming(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Copy link to ${a.fileName}`}
                        onClick={() =>
                          navigator.clipboard
                            .writeText(a.url)
                            .then(() => toast.success("Link copied"))
                            .catch(() => toast.error("Couldn't copy the link"))
                        }
                      >
                        <Copy className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${a.fileName}`}
                        onClick={() => setConfirming(a.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
