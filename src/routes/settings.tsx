import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: typeof search["tab"] === "string" ? search["tab"] : "",
  }),
  head: () =>
    pageHead({
      title: "Settings | mdstudio",
      description: "Your account and editor settings.",
      path: "/settings",
      noindex: true,
    }),
  component: SettingsRoute,
});

function SettingsRoute() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: "/settings" });
  return <SettingsPage tab={tab} onTab={(next) => void navigate({ search: { tab: next } })} />;
}
