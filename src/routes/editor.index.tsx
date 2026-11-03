import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { fetchAccount } from "@/lib/account/client";
import { documentStore, indexedDbStore, SAMPLE } from "@/lib/storage/documentStore";
import { cloudOwners, isVisible } from "@/lib/sync/meta";
import { pageHead } from "@/lib/site/seo";

export const Route = createFileRoute("/editor/")({
  head: () =>
    pageHead({
      title: "Editor | mdstudio",
      description: "Write and preview portable Markdown with live preview, import and export.",
      path: "/editor",
      noindex: true,
    }),
  component: EditorIndex,
});

function EditorIndex() {
  const navigate = useNavigate();
  useEffect(() => {
    (async () => {
      // Drafts kept in someone's cloud belong to that account and are not opened for anyone else.
      const [docs, owners, { user }] = await Promise.all([
        documentStore.list(),
        cloudOwners(indexedDbStore),
        fetchAccount(),
      ]);
      const d =
        docs.find((x) => isVisible(owners, x.id, user?.id)) ??
        (await documentStore.create({ content: SAMPLE }));
      navigate({ to: "/editor/$docId", params: { docId: d.id }, replace: true });
    })();
  }, [navigate]);
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Opening your drafts…
    </div>
  );
}
