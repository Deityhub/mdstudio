import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/signup")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/auth/routes")).signupHandler(request),
    },
  },
});
