import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/plans/$name")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/admin/routes")).deletePlanHandler(request, params.name),
    },
  },
});
