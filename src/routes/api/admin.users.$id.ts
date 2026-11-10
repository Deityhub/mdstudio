import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/users/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/admin/routes")).userHandler(request, params.id),
      PATCH: async ({ request, params }) =>
        (await import("@/server/admin/routes")).updateUserHandler(request, params.id),
      DELETE: async ({ request, params }) =>
        (await import("@/server/admin/routes")).deleteUserHandler(request, params.id),
    },
  },
});
