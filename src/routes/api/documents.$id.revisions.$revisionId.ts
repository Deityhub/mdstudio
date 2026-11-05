import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/documents/$id/revisions/$revisionId")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/revisions/routes")).getHandler(
          request,
          params.id,
          params.revisionId,
        ),
    },
  },
});
