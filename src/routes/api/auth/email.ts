import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/email")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        (await import("@/server/auth/routes")).emailChangeHandler(request),
    },
  },
});
