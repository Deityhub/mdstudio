import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/auth/verify/resend")({
  server: {
    handlers: {
      POST: async ({ request }) => (await import("@/server/auth/routes")).resendHandler(request),
    },
  },
});
