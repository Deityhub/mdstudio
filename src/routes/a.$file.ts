import { createFileRoute } from "@tanstack/react-router";

// Public image links: `/a/<id>.<ext>`.
export const Route = createFileRoute("/a/$file")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/assets/routes")).serveHandler(request, params.file),
    },
  },
});
