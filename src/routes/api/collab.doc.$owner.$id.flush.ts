import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/collab/doc/$owner/$id/flush")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        (await import("@/server/collab/routes")).flushHandler(request, params.owner, params.id),
    },
  },
});
