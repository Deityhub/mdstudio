import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/s/$slug/comments/$commentId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/share/routes")).commentDeleteHandler(
          request,
          params.slug,
          params.commentId,
        ),
    },
  },
});
