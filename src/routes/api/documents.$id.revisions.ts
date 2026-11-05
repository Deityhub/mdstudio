import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents/$id/revisions")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/revisions/routes")).listHandler(request, params.id),
    },
  },
});
