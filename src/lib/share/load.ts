// The data behind a share page, read on the server (the page's loader calls this, in the browser
// too, over the server-function channel). It lives outside src/server because the client build may
// import a server function, which it turns into a call; the body stays on the server. Only what the
// page shows leaves here: nothing about the account or the draft's id.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

export const loadSharedPage = createServerFn({ method: "GET" })
  .validator(z.object({ slug: z.string().min(1).max(64) }))
  .handler(async ({ data }) => {
    const request = getRequest();
    const [{ getDb }, { readToken }, { userForToken }, { loadPage }] = await Promise.all([
      import("@/server/db"),
      import("@/server/auth/http"),
      import("@/server/auth/service"),
      import("@/server/share/page"),
    ]);
    const db = await getDb(request);
    const token = readToken(request);
    const session = token ? await userForToken(db, token) : null;
    return loadPage(db, data.slug, session?.user ?? null);
  });
