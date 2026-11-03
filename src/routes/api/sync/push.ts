import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sync/push")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/sync/routes")).pushHandler(request),
    },
  },
});
