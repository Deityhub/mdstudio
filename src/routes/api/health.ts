import { createFileRoute } from "@tanstack/react-router";

// Liveness probe for Docker, uptime checks and the CI smoke test.
// Database connectivity is added when the server blueprint is activated (milestone 3).
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } }),
    },
  },
});
