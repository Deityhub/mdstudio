import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/github")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/server/auth/routes")).githubStartHandler(request),
    },
  },
});
