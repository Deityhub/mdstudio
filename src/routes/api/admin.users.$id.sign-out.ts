import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/users/$id/sign-out")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        (await import("@/server/admin/routes")).signOutHandler(request, params.id),
    },
  },
});
