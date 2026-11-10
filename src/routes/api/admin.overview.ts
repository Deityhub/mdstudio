import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/overview")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/admin/routes")).overviewHandler(request),
    },
  },
});
