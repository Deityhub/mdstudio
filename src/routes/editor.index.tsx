import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { fetchAccount } from "@/lib/account/client";
import { documentStore, indexedDbStore, NEW_DOC_ID } from "@/lib/storage/documentStore";
import { cloudOwners, isVisibleDoc } from "@/lib/sync/meta";
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
      // With nothing of their own, they see the example, which is saved only once they edit it.
      const docId = docs.find((x) => isVisibleDoc(owners, x, user?.id))?.id ?? NEW_DOC_ID;
      navigate({ to: "/editor/$docId", params: { docId }, replace: true });
    })();
  }, [navigate]);
  return <PageLoader label="Opening your drafts" />;
}
