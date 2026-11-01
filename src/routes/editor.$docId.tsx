import { createFileRoute } from "@tanstack/react-router";
import { Studio } from "@/components/studio/Studio";

export const Route = createFileRoute("/editor/$docId")({
  head: () => ({
    meta: [
      { title: "Draft | Markdown Studio" },
      {
        name: "description",
        content: "Edit a Markdown draft with a faithful live preview and portability checks.",
      },
      { property: "og:title", content: "Draft | Markdown Studio" },
      {
        property: "og:description",
        content: "Edit a Markdown draft with a faithful live preview and portability checks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DocPage,
});

function DocPage() {
  const { docId } = Route.useParams();
  return <Studio docId={docId} />;
}
