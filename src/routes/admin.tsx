import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminPage } from "@/components/admin/AdminPage";
import { ADMIN_TABS, type AdminTab } from "@/lib/admin/tabs";
import { pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: ADMIN_TABS.includes(search["tab"] as AdminTab) ? (search["tab"] as AdminTab) : "overview",
    user: typeof search["user"] === "string" ? search["user"] : "",
  }),
  head: () =>
    pageHead({
      title: "Admin | mdstudio",
      description: "Administration.",
      path: "/admin",
      noindex: true,
    }),
  component: AdminRoute,
});

function AdminRoute() {
  const { tab, user } = Route.useSearch();
  const navigate = useNavigate({ from: "/admin" });
  return (
    <AdminPage
      tab={tab}
      user={user || null}
      onTab={(next) => void navigate({ search: { tab: next, user: "" } })}
      onUser={(id) => void navigate({ search: { tab, user: id ?? "" } })}
    />
  );
}
