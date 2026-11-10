import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/users/$id/content")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/admin/routes")).contentHandler(request, params.id),
    },
  },
});
