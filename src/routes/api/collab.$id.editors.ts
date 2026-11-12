import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/collab/$id/editors")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        (await import("@/server/collab/routes")).addEditorHandler(request, params.id),
    },
  },
});
