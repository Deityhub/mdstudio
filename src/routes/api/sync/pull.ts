import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/sync/pull")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/sync/routes")).pullHandler(request),
    },
  },
});
