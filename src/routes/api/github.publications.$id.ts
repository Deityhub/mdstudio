import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/publications/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/github/routes")).publicationsHandler(request, params.id),
    },
  },
});
