import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/users/$id/$kind/$item")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/admin/routes")).removeContentHandler(
          request,
          params.id,
          params.kind,
          params.item,
        ),
    },
  },
});
