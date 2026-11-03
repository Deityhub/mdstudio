import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/auth/routes")).logoutHandler(request),
    },
  },
});
