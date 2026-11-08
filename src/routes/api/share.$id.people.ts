import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/share/$id/people")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/share/routes")).peopleListHandler(request, params.id),
      POST: async ({ request, params }) =>
        (await import("@/server/share/routes")).peopleAddHandler(request, params.id),
    },
  },
});
