import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/google")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        (await import("@/server/auth/routes")).googleStartHandler(request),
    },
  },
});
