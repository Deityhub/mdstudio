import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/password")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/auth/routes")).passwordHandler(request),
    },
  },
});
