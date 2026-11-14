import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/links/$provider")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        (await import("@/server/auth/routes")).unlinkHandler(request, params.provider),
    },
  },
});
