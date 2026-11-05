import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/me")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/auth/routes")).meHandler(request),
    },
  },
});
