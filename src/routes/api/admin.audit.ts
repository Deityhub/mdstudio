import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/audit")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/admin/routes")).auditHandler(request),
    },
  },
});
