import type { SessionState } from "@/lib/collab/session";
import { cn } from "@/lib/utils";

/** What a live draft says about itself in the footer: the connection, and who else is in it. */
function liveLabel(state: SessionState, waiting: boolean) {
  if (state.status === "ended") return "No longer shared with you";
  if (waiting)
    return state.status === "offline"
      ? "Shared draft: connect once to start editing"
      : "Opening the shared draft…";
  if (state.status === "live") return "Live";
  return "Offline: your edits are kept here and will merge";
}

export function CollabStatus({ state, waiting }: { state: SessionState; waiting: boolean }) {
  const live = state.status === "live" && !waiting;
  return (
    <span
      data-testid="collab-status"
      data-state={state.status === "ended" ? "ended" : waiting ? "waiting" : state.status}
      className="flex items-center gap-1.5"
    >
      <span
        aria-hidden
        className={cn("size-2 rounded-full", live ? "bg-primary" : "bg-muted-foreground")}
      />
      <span>{liveLabel(state, waiting)}</span>
      {live && state.peers.length > 0 && (
        <span className="flex items-center -space-x-1" data-testid="collab-peers">
          {state.peers.slice(0, 5).map((p) => (
            <span
              key={p.id}
              title={p.name}
              role="img"
              aria-label={`${p.name} is here`}
              className="flex size-5 items-center justify-center overflow-hidden rounded-full border border-background text-[10px] font-medium text-background"
              style={{ backgroundColor: p.color }}
            >
              {p.avatar ? (
                <img src={p.avatar} alt="" className="size-full object-cover" />
              ) : (
                (p.name.trim()[0] ?? "?").toUpperCase()
              )}
            </span>
          ))}
          {state.peers.length > 5 && (
            <span className="pl-2 text-[10px]">+{state.peers.length - 5}</span>
          )}
        </span>
      )}
    </span>
  );
}
