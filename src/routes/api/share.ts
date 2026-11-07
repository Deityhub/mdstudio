import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/share")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/share/routes")).listHandler(request),
      POST: async ({ request }) => (await import("@/server/share/routes")).publishHandler(request),
    },
  },
});
