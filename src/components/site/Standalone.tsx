import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A screen that stands on its own (a private link's sign-in, an invitation, a password reset, a
 * missing page): the logo and a way into the editor above, the content centred below.
 */
export function Standalone({ children, editor = true }: { children: ReactNode; editor?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 sm:px-5">
        <Logo markClassName="size-6" textClassName="text-base" />
        {editor && (
          <Button asChild size="sm" className="ml-auto">
            <Link to="/editor">Open the editor</Link>
          </Button>
        )}
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-6">{children}</main>
    </div>
  );
}

/** The bordered box a form or a notice sits in on a standalone screen. */
export function StandaloneBox({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full max-w-110 flex-col gap-3.5 rounded-md border border-border bg-card p-5 sm:p-7",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** What any address that leads nowhere shows (and the dashboard, to anyone but an admin). */
export function NotFoundPage() {
  return (
    <Standalone>
      <div className="max-w-115 text-center">
        <p className="font-mono text-6xl font-semibold text-primary">404</p>
        <h1 className="mt-2 font-display text-2xl font-semibold">Page not found</h1>
        <p className="mt-2 mb-6 text-muted-foreground">
          This page isn't here. The link may have expired or been turned off by the person who
          shared it.
        </p>
        <div className="flex flex-wrap justify-center gap-2.5">
          <Button asChild size="lg">
            <Link to="/editor">Open the editor</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/">Go home</Link>
          </Button>
        </div>
      </div>
    </Standalone>
  );
}
