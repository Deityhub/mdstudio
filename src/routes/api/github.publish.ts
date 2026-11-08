import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/publish")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/github/routes")).publishHandler(request),
    },
  },
});
