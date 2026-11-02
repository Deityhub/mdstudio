import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { documentStore, SAMPLE } from "@/lib/documentStore";
import { pageHead } from "@/lib/seo";

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
      const docs = await documentStore.list();
      const d = docs[0] ?? (await documentStore.create({ content: SAMPLE }));
      navigate({ to: "/editor/$docId", params: { docId: d.id }, replace: true });
    })();
  }, [navigate]);
  return (
    <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
      Opening your drafts…
    </div>
  );
}
