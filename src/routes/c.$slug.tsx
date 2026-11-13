import { createFileRoute } from "@tanstack/react-router";
import { OpenInvite } from "@/components/share/OpenInvite";
import { pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/c/$slug")({
  head: ({ params }) =>
    pageHead({
      title: "Open a shared draft | mdstudio",
      description: "Open a draft you were invited to edit together.",
      path: `/c/${params.slug}`,
      noindex: true,
    }),
  // for one invited person: nothing may keep it
  headers: () => ({ "cache-control": "private, no-store", "x-robots-tag": "noindex" }),
  component: Page,
});

function Page() {
  const { slug } = Route.useParams();
  return <OpenInvite link={slug} />;
}
