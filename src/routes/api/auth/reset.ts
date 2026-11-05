import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/reset")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/auth/routes")).resetHandler(request),
    },
  },
});
