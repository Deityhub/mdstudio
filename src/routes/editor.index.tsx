import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { documentStore, SAMPLE } from "@/lib/documentStore";

export const Route = createFileRoute("/editor/")({
  head: () => ({
    meta: [
      { title: "Editor | Markdown Studio" },
      {
        name: "description",
        content: "Write and preview portable Markdown with live preview, import and export.",
      },
      { property: "og:title", content: "Editor | Markdown Studio" },
      {
        property: "og:description",
        content: "Write and preview portable Markdown with live preview, import and export.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
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
