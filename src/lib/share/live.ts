// What a live event does to the list of comments a page or panel is showing. Pure, so it is the
// same for the writer's panel and the reader's page, and harmless when an event arrives twice (an
// echo of one's own change, or one the list was already loaded with).
import type { RealtimeEvent } from "../realtime/protocol";
import type { ShareComment } from "./protocol";

/** Puts a comment in the list by its id: replaces it when there, adds it when not. */
export function upsertComment(items: ShareComment[], comment: ShareComment): ShareComment[] {
  return items.some((x) => x.id === comment.id)
    ? items.map((x) => (x.id === comment.id ? comment : x))
    : [...items, comment];
}

export function applyCommentEvent(items: ShareComment[], event: RealtimeEvent): ShareComment[] {
  switch (event.t) {
    case "comment": {
      // the author's own tab already has it as theirs; an event only ever says `mine: false`
      const have = items.find((x) => x.id === event.comment.id);
      return upsertComment(items, have ? { ...event.comment, mine: have.mine } : event.comment);
    }
    case "comment_resolved":
      return items.some((x) => x.id === event.id)
        ? items.map((x) => (x.id === event.id ? { ...x, resolved: event.resolved } : x))
        : items;
    case "comment_deleted":
      return items.some((x) => x.id === event.id)
        ? items.filter((x) => x.id !== event.id && x.parentId !== event.id)
        : items;
    case "share":
      // a new copy makes every comment written so far refer to an earlier one
      return event.change === "updated" ? items.map((x) => ({ ...x, outdated: true })) : items;
    default:
      return items;
  }
}
