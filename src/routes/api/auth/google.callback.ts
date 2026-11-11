import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/server/auth/routes")).googleCallbackHandler(request),
    },
  },
});
