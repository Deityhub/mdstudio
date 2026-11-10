import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/plans")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/admin/routes")).plansHandler(request),
      PUT: async ({ request }) => (await import("@/server/admin/routes")).savePlanHandler(request),
    },
  },
});
