import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/email/confirm")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/server/auth/routes")).emailConfirmHandler(request),
    },
  },
});
