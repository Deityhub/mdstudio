import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/server/auth/routes")).githubCallbackHandler(request),
    },
  },
});
