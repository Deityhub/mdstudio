import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/integrations/$id")({
  server: {
    handlers: {
      PUT: async ({ request, params }) =>
        (await import("@/server/ai/routes")).putHandler(request, params.id),
      DELETE: async ({ request, params }) =>
        (await import("@/server/ai/routes")).deleteHandler(request, params.id),
    },
  },
});
