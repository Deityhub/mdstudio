import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/assets")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/assets/routes")).listHandler(request),
      POST: async ({ request }) => (await import("@/server/assets/routes")).uploadHandler(request),
    },
  },
});
