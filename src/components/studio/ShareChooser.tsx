import { MessageSquareText, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Choice({
  icon,
  title,
  body,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
    >
      <span className="mt-0.5 text-primary">{icon}</span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
      </span>
    </button>
  );
}

/** The one Share button's first step: send the draft out to be read, or open it up to be written. */
export function ShareChooser({
  open,
  onOpenChange,
  onReview,
  onEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: () => void;
  onEdit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share this draft</DialogTitle>
          <DialogDescription>Choose how the other people take part.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Choice
            icon={<MessageSquareText className="size-5" />}
            title="Share for review"
            body="A read-only copy at a link, to anyone or to people you name. Readers can comment on the words."
            onClick={onReview}
          />
          <Choice
            icon={<Users className="size-5" />}
            title="Edit together"
            body="Invite people by email to type in this draft with you, at the same time."
            onClick={onEdit}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
