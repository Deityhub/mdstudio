import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/login")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/auth/routes")).loginHandler(request),
    },
  },
});
