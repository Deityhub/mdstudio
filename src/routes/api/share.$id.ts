import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/share/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        (await import("@/server/share/routes")).updateHandler(request, params.id),
      DELETE: async ({ request, params }) =>
        (await import("@/server/share/routes")).revokeHandler(request, params.id),
    },
  },
});
