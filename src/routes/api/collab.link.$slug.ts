import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/collab/link/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/collab/routes")).openLinkHandler(request, params.slug),
    },
  },
});
