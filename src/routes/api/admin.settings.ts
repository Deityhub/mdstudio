import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/admin/settings")({
  server: {
    handlers: {
      GET: async ({ request }) => (await import("@/server/admin/routes")).settingsHandler(request),
      PATCH: async ({ request }) =>
        (await import("@/server/admin/routes")).updateSettingsHandler(request),
    },
  },
});
