import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/collab")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/collab/routes")).sharedHandler(request),
    },
  },
});
