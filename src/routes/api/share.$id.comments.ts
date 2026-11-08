import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/share/$id/comments")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/share/routes")).ownerCommentsHandler(request, params.id),
    },
  },
});
