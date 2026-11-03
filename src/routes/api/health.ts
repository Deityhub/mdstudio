import { createFileRoute } from "@tanstack/react-router";
import { sql } from "drizzle-orm";

// Liveness probe for Docker, uptime checks and the CI smoke test. Reports whether the database
// answers, without failing the probe: the editor itself works fully offline of the server.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        let database: "ok" | "unavailable" = "ok";
        try {
          const { getDb } = await import("@/server/db");
          await (await getDb(request)).run(sql`select 1`);
        } catch (error) {
          console.error(error);
          database = "unavailable";
        }
        return Response.json(
          { status: "ok", database },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
