import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/share/$id/comments/$commentId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        (await import("@/server/share/routes")).ownerCommentHandler(
          request,
          params.id,
          params.commentId,
        ),
      DELETE: async ({ request, params }) =>
        (await import("@/server/share/routes")).ownerCommentHandler(
          request,
          params.id,
          params.commentId,
        ),
    },
  },
});
