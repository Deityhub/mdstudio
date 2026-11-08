import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/s/$slug/comments")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/share/routes")).commentsListHandler(request, params.slug),
      POST: async ({ request, params }) =>
        (await import("@/server/share/routes")).commentsAddHandler(request, params.slug),
    },
  },
});
