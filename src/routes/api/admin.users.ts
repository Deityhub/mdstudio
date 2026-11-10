import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/users")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/admin/routes")).usersHandler(request),
    },
  },
});
