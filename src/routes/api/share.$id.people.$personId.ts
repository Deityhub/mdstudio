import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/share/$id/people/$personId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/share/routes")).personRemoveHandler(
          request,
          params.id,
          params.personId,
        ),
    },
  },
});
