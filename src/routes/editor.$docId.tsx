import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/editor/$docId")({
  head: () =>
    pageHead({
      title: "Draft | mdstudio",
      description: "Edit a Markdown draft with a faithful live preview and portability checks.",
      path: "/editor",
      noindex: true,
    }),
  component: DocPage,
});

function DocPage() {
  const { docId } = Route.useParams();
  return <Studio docId={docId} />;
}
