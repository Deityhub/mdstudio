import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/ai/integrations")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/ai/routes")).listHandler(request),
    },
  },
});
