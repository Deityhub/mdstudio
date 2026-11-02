import { createStart, createCsrfMiddleware, createMiddleware } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";

import { createNonce, securityHeaders, setRequestNonce } from "./lib/csp";

import { renderErrorPage } from "./lib/error-page";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

// Production only: Vite dev needs inline HMR scripts and a websocket that the policy would block.
const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  if (import.meta.env.PROD) {
    const nonce = createNonce();
    setRequestNonce(getRequest(), nonce);
    for (const [name, value] of Object.entries(securityHeaders(nonce)))
      setResponseHeader(name, value);
  }
  return next();
});

// Start installs this automatically when src/start.ts is absent; defining the
// file opts out, so re-add it explicitly to keep server functions protected
// from cross-site requests.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware, csrfMiddleware],
}));
