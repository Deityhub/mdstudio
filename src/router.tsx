import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getRequestNonce } from "./lib/csp";
import { routeTree } from "./routeTree.gen";

// Undefined in dev and in the browser; set by the security-headers middleware in production.
const getNonce = createIsomorphicFn()
  .server(() => getRequestNonce(getRequest()))
  .client(() => undefined);

export const getRouter = () => {
  const queryClient = new QueryClient();
  const nonce = getNonce();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ...(nonce && { ssr: { nonce } }),
  });

  return router;
};
