import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/assets/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/assets/routes")).deleteHandler(request, params.id),
    },
  },
});
