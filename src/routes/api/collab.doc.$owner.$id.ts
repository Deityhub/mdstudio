import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/collab/doc/$owner/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/collab/routes")).leaveHandler(request, params.owner, params.id),
    },
  },
});
