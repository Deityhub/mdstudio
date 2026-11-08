import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/connection")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/github/routes")).statusHandler(request),
      DELETE: async ({ request }) =>
        (await import("@/server/github/routes")).disconnectHandler(request),
    },
  },
});
