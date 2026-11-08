import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/connect")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/server/github/routes")).connectStartHandler(request),
    },
  },
});
