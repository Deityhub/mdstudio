import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { AccountMenu } from "@/components/studio/AccountMenu";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/**
 * The frame of the app's own pages (Settings, Admin): a top bar with the logo and a label, and a
 * menu of sections on the left (a row of chips on phones). Each section is a Radix tab, so the menu
 * keeps tab semantics and arrow-key movement.
 */
export function AppShell<T extends string>({
  label,
  sections,
  current,
  onSection,
  menuLabel,
  wide,
  children,
}: {
  label: ReactNode;
  sections: readonly { id: T; label: string }[];
  current: T;
  onSection: (id: T) => void;
  menuLabel: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <AppTopBar label={label} wide={!!wide} />
      <Tabs
        value={current}
        onValueChange={(v) => onSection(v as T)}
        orientation="vertical"
        className={cn(
          "mx-auto flex flex-col gap-4 p-4 md:flex-row md:items-start md:gap-10 md:px-6 md:py-8",
          wide ? "max-w-310" : "max-w-280",
        )}
      >
        <TabsList
          aria-label={menuLabel}
          className="flex h-auto w-full shrink-0 items-stretch justify-start gap-1.5 overflow-x-auto bg-transparent p-0 md:w-52 md:flex-col md:gap-0.5 md:overflow-visible"
        >
          {sections.map((s) => (
            <TabsTrigger
              key={s.id}
              value={s.id}
              className="justify-start border border-border px-3 py-2 text-sm md:rounded-l-none font-normal text-muted-foreground data-[state=active]:bg-accent data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-none md:border-0 md:data-[state=active]:shadow-[inset_2px_0_0_var(--color-primary)]"
            >
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <main className="min-w-0 flex-1">{children}</main>
      </Tabs>
    </div>
  );
}

/** The top bar of the app's own pages, and of the screens that stand on their own. */
export function AppTopBar({
  label,
  editor = true,
  wide = false,
}: {
  label?: ReactNode;
  editor?: boolean;
  wide?: boolean;
}) {
  return (
    <header className="border-b border-border">
      {/* the same width and side padding as the page's content below, so the two line up */}
      <div
        className={cn(
          "mx-auto flex h-14 items-center gap-3 px-4 md:px-6",
          wide ? "max-w-310" : "max-w-280",
        )}
      >
        <Logo markClassName="size-6" textClassName="text-base" />
        {label}
        <div className="ml-auto flex items-center gap-2">
          {editor && (
            <Button asChild size="sm">
              <Link to="/editor">Back to the editor</Link>
            </Button>
          )}
          <AccountMenu settings={false} />
        </div>
      </div>
    </header>
  );
}

/** A page's heading, with the line under it. */
export function PageTitle({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-2xl font-semibold">{title}</h1>
      {sub && <p className="mt-1 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** A bordered group of rows. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        // the controls inside take the card's own colour (an outline, not a darker well)
        "mb-5 overflow-hidden rounded-md border border-border bg-card [&_.bg-background:not(:hover)]:bg-transparent",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** A heading between two cards. */
export function CardHeading({ children }: { children: ReactNode }) {
  return <h2 className="mt-6 mb-2.5 font-sans text-base font-semibold">{children}</h2>;
}
