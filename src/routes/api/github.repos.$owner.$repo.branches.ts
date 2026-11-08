import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/github/repos/$owner/$repo/branches")({
  server: {
    handlers: {
      GET: async ({ request, params }) =>
        (await import("@/server/github/routes")).branchesHandler(
          request,
          params.owner,
          params.repo,
        ),
    },
  },
});
