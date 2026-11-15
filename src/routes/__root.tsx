import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { AiCloudSession } from "@/components/AiCloudSession";
import { AuthNotices } from "@/components/AuthNotices";
import { SearchHost } from "@/components/search/SearchHost";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { NotFoundPage, Standalone } from "@/components/site/Standalone";
import { jsonLd, jsonLdScript, pageHead, SITE } from "@/lib/site/seo";
import { registerServiceWorker } from "@/lib/pwa/register";
import { themeInitScript } from "@/lib/ui/theme";

function NotFoundComponent() {
  return <NotFoundPage />;
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <Standalone editor={false}>
      <div className="max-w-115 text-center">
        <h1 className="font-display text-2xl font-semibold">This page didn't load</h1>
        <p className="mt-2 mb-6 text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button
            size="lg"
            onClick={() => {
              router.invalidate();
              reset();
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="/">Go home</a>
          </Button>
        </div>
      </div>
    </Standalone>
  );
}

const defaults = pageHead({ title: SITE.name, description: SITE.description, path: "/" });

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#f8f4ec", media: "(prefers-color-scheme: light)" },
      { name: "theme-color", content: "#1c1a17", media: "(prefers-color-scheme: dark)" },
      { property: "og:site_name", content: SITE.name },
      { property: "og:locale", content: "en_US" },
      // Defaults for any page without its own head (404s); pages set their own with pageHead.
      ...defaults.meta.filter((m) => !("property" in m && m.property === "og:url")),
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      // Preload the two fonts used above the fold; the mono font loads on demand in the editor.
      ...["fraunces", "ibm-plex-sans"].map((name) => ({
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: `/fonts/${name}.woff2`,
        crossOrigin: "anonymous" as const,
      })),
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
    // First so the theme class is set before anything paints.
    scripts: [{ children: themeInitScript }, ...jsonLd().map(jsonLdScript)],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => registerServiceWorker(), []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster position="bottom-right" />
      <AuthNotices />
      <AiCloudSession />
      <SearchHost />
    </QueryClientProvider>
  );
}
