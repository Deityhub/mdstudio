import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/collab/$id/editors/$editorId")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/collab/routes")).removeEditorHandler(
          request,
          params.id,
          params.editorId,
        ),
    },
  },
});
