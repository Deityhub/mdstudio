import { createFileRoute } from "@tanstack/react-router";

// The socket itself is handled before routing (src/server.ts); this answers a plain request.
export const Route = createFileRoute("/api/realtime")({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          { error: "upgrade_required" },
          { status: 426, headers: { "cache-control": "no-store", upgrade: "websocket" } },
        ),
    },
  },
});
