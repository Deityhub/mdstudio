import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/collab/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/collab/routes")).stateHandler(request, params.id),
      POST: async ({ request, params }) =>
        (await import("@/server/collab/routes")).enableHandler(request, params.id),
      DELETE: async ({ request, params }) =>
        (await import("@/server/collab/routes")).disableHandler(request, params.id),
    },
  },
});
