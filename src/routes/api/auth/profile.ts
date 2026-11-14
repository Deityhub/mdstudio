import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/profile")({
  server: {
    handlers: {
      PATCH: async ({ request }) => (await import("@/server/auth/routes")).profileHandler(request),
    },
  },
});
