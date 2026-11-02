import {
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ClientOnly, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Upload,
  Download,
  Copy,
  FilePlus,
  Trash2,
  CopyPlus,
  Columns2,
  PanelLeft,
  FileText,
  Eye,
  Maximize2,
  Minimize2,
  AlertTriangle,
  Info,
  CircleAlert,
  CheckCircle2,
  ListTree,
  Tags,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { documentStore, SAMPLE, type MdDocument } from "@/lib/documentStore";
import { compressImage, kb, safeImageName } from "@/lib/images";
import {
  PROFILES,
  type Profile,
  renderMarkdown,
  checkPortability,
  getOutline,
  getStats,
  deriveTitle,
  slugify,
  finalizeText,
  normalizeMarkdown,
  embedImages,
  htmlToMarkdown,
  supports,
  splitFrontMatter,
  joinFrontMatter,
} from "@/lib/markdown";
import type { Command, Context, Edit, Snapshot } from "@/lib/editing";
import { findLinkAt, insertImage, insertLink, type FoundLink } from "@/lib/editing-insert";
import { hydrateDiagrams, withCachedDiagrams } from "@/lib/diagrams";
import { renderExportBody, standaloneDocument } from "@/lib/export";
import { ensureMath, hasMathSyntax, isMathLoaded } from "@/lib/math";
import { patchHtml } from "@/lib/preview-dom";
import { insertTable } from "@/lib/tables";
import { EditorToolbar, type ToolbarHandle } from "./EditorToolbar";
import { ShortcutsDialog } from "./ShortcutsDialog";
import {
  ImageDialog,
  LinkDialog,
  TableDialog,
  type ImageSubmit,
  type LinkDialogState,
} from "./InsertDialogs";
import type { EditorHandle } from "./MarkdownEditor";
import { AiWriter } from "./AiWriter";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const NO_IMAGES: Record<string, string> = {};
const NO_CONTEXT: Context = {
  bold: false,
  italic: false,
  strike: false,
  code: false,
  highlight: false,
  heading: 0,
  quote: false,
  list: null,
  codeLang: null,
  table: false,
  alert: null,
};
type SaveState = "saved" | "saving" | "error";

const MarkdownEditor = lazy(() => import("./MarkdownEditor"));

type View = "split" | "editor" | "preview";
type Panel = "checks" | "outline" | "meta" | null;

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFile(file: File) {
  return file.text();
}

export function Studio({ docId }: { docId: string }) {
  const navigate = useNavigate();
  // The studio is a fixed app shell: only the panes inside it scroll, never the page.
  useEffect(() => {
    document.documentElement.classList.add("studio-open");
    return () => document.documentElement.classList.remove("studio-open");
  }, []);
  const [doc, setDoc] = useState<MdDocument | null>(null);
  const [docs, setDocs] = useState<MdDocument[]>([]);
  const [missing, setMissing] = useState(false);
  const [profile, setProfile] = useState<Profile>("github");
  const [view, setView] = useState<View>("split");
  const [panel, setPanel] = useState<Panel>("checks");
  const [library, setLibrary] = useState(true);
  const [focus, setFocus] = useState(false);
  const [ctx, setCtx] = useState<Context>(NO_CONTEXT);
  const [linkDialog, setLinkDialog] = useState<{
    open: boolean;
    initial: LinkDialogState;
    found: FoundLink | null;
  }>({ open: false, initial: { text: "", url: "", title: "", editing: false }, found: null });
  const [imageDialog, setImageDialog] = useState({ open: false, initialAlt: "" });
  const [tableDialog, setTableDialog] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const toolbar = useRef<ToolbarHandle>(null);
  const [compact, setCompact] = useState(false);
  const [phone, setPhone] = useState(false);
  const [mobileLibrary, setMobileLibrary] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<Panel>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1280px)");
    const small = window.matchMedia("(max-width: 767px)");
    const sync = () => {
      setCompact(!desktop.matches);
      setPhone(small.matches);
    };
    sync();
    desktop.addEventListener("change", sync);
    small.addEventListener("change", sync);
    return () => {
      desktop.removeEventListener("change", sync);
      small.removeEventListener("change", sync);
    };
  }, []);
  const [normalize, setNormalize] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const preview = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollLock = useRef(0);

  // load prefs + docs
  useEffect(() => {
    const p = localStorage.getItem("md:profile") as Profile | null;
    if (p && PROFILES.some((x) => x.id === p)) setProfile(p);
    setNormalize(localStorage.getItem("md:normalize") === "1");
  }, []);
  // Saved where the choice is made, not in an effect: an effect on mount would overwrite the
  // stored value with the default before (or while) it is loaded.
  const chooseProfile = (p: Profile) => {
    setProfile(p);
    localStorage.setItem("md:profile", p);
  };
  const chooseNormalize = (on: boolean) => {
    setNormalize(on);
    localStorage.setItem("md:normalize", on ? "1" : "0");
  };

  const refreshList = useCallback(() => documentStore.list().then(setDocs), []);
  useEffect(() => {
    setMissing(false);
    documentStore.get(docId).then((d) => (d ? setDoc(d) : setMissing(true)));
    refreshList();
  }, [docId, refreshList]);

  // autosave: debounced, but any unsaved draft is flushed before it can be lost
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const saveSeq = useRef(0);
  const pending = useRef<MdDocument | null>(null);
  const flush = useCallback(() => {
    const d = pending.current;
    if (!d) return;
    pending.current = null;
    const seq = ++saveSeq.current;
    return documentStore
      .save(d)
      .then(refreshList)
      .then(() => {
        if (seq === saveSeq.current) setSaveState("saved");
      })
      .catch((error) => {
        console.error(error);
        if (seq !== saveSeq.current) return;
        setSaveState("error");
        // fixed id: repeated failures update one toast instead of stacking
        toast.error("Couldn't save this draft in the browser.", {
          id: "autosave-error",
          description:
            "Your text is still on screen. Export it or free up storage, then keep typing to retry.",
        });
      });
  }, [refreshList]);
  useEffect(() => {
    if (!doc) return;
    pending.current = doc;
    setSaveState("saving");
    const t = setTimeout(flush, 400);
    return () => clearTimeout(t);
  }, [doc, flush]);
  // Flush on draft switch, leaving the studio, hiding the tab (mobile) and closing it.
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [docId, flush]);

  const update = useCallback((patch: Partial<MdDocument>) => {
    setDoc((d) => {
      if (!d) return d;
      const next = { ...d, ...patch, updatedAt: Date.now() };
      next.title = deriveTitle(next.content);
      return next;
    });
  }, []);
  const setContent = useCallback((content: string) => update({ content }), [update]);

  const content = doc?.content ?? "";
  const deferred = useDeferredValue(content);
  const images = doc?.images ?? NO_IMAGES;
  // KaTeX loads only when a document has math; bumping this re-renders once it is ready.
  const [mathVersion, setMathVersion] = useState(0);
  useEffect(() => {
    if (!supports("math", profile) || !hasMathSyntax(deferred) || isMathLoaded()) return;
    ensureMath()
      .then(() => setMathVersion((v) => v + 1))
      .catch((error) => {
        console.error(error);
        toast.error("Couldn't load math rendering. Check your connection and try again.", {
          id: "math-load",
        });
      });
  }, [deferred, profile]);
  const html = useMemo(() => {
    const rendered = renderMarkdown(deferred, profile, images);
    // known diagrams go straight into the HTML so they never show up as code while typing
    return supports("mermaid", profile) ? withCachedDiagrams(rendered) : rendered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferred, profile, images, mathVersion]);
  // Only the blocks that changed are replaced (see patchHtml), then pending diagrams render.
  // This runs before paint, so the preview never shows an intermediate state.
  const previewBody = useRef<HTMLElement | null>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html;
  const syncPreview = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      patchHtml(el, htmlRef.current);
      if (supports("mermaid", profile)) hydrateDiagrams(el).catch((e) => console.error(e));
    },
    [profile],
  );
  useLayoutEffect(() => syncPreview(previewBody.current), [html, syncPreview]);
  const issues = useMemo(() => checkPortability(deferred, profile), [deferred, profile]);
  const outline = useMemo(() => getOutline(deferred), [deferred]);
  const stats = useMemo(() => getStats(deferred), [deferred]);
  const fm = useMemo(() => splitFrontMatter(content), [content]);

  /* ---------- scroll sync ---------- */
  const onEditorScroll = (r: number) => {
    if (Date.now() - scrollLock.current < 80) return;
    const el = preview.current;
    if (!el) return;
    scrollLock.current = Date.now();
    el.scrollTop = r * (el.scrollHeight - el.clientHeight);
  };
  const onPreviewScroll = () => {
    if (Date.now() - scrollLock.current < 80) return;
    const el = preview.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    scrollLock.current = Date.now();
    editor.current?.scrollToRatio(max > 0 ? el.scrollTop / max : 0);
  };

  /* ---------- import ---------- */
  const importText = async (text: string, name?: string) => {
    const d = await documentStore.create({
      content: text,
      title: deriveTitle(text) || name || "Untitled",
    });
    toast.success(`Imported ${name ?? "document"}`);
    navigate({ to: "/editor/$docId", params: { docId: d.id } });
  };

  const addImages = async (files: File[], alt?: string) => {
    if (!doc) return;
    const next = { ...doc.images };
    const refs: string[] = [];
    for (const f of files) {
      const data = await compressImage(f);
      const name = safeImageName(f.name || "pasted.png", next);
      next[name] = data;
      const label = (files.length === 1 && alt) || name.replace(/\.[a-z0-9]+$/, "");
      refs.push(`![${label.replace(/[[\]]/g, "\\$&")}](./images/${name})`);
      if (kb(data) > 500)
        toast.warning(`${name} is ${kb(data)} KB. Large embedded images make the file heavy.`);
    }
    update({ images: next });
    editor.current?.insert(refs.join("\n"));
  };

  const onFiles = async (files: File[]) => {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const texts = files.filter(
      (f) => /\.(md|markdown|mdown|txt)$/i.test(f.name) || f.type.startsWith("text/"),
    );
    if (imgs.length) await addImages(imgs);
    for (const t of texts) await importText(await readFile(t), t.name);
    if (!imgs.length && !texts.length)
      toast.error("Only Markdown, text or image files can be dropped here.");
  };

  const onPaste = (e: ClipboardEvent): string | null => {
    const htmlData = e.clipboardData?.getData("text/html");
    if (!htmlData || !/<(p|h[1-6]|li|strong|b|em|a|table|blockquote|pre)[\s>]/i.test(htmlData))
      return null;
    try {
      const md = htmlToMarkdown(htmlData);
      if (!md) return null;
      toast("Converted formatted text to Markdown", {
        description: "Press Ctrl/⌘+Z to undo and paste plain text instead.",
      });
      return md;
    } catch {
      return null;
    }
  };

  /* ---------- export ---------- */
  const out = (selfContained = false) => {
    let md = selfContained ? embedImages(content, images) : content;
    md = normalize ? normalizeMarkdown(md, profile) : finalizeText(md);
    return md;
  };
  const fileBase = () => {
    const s = fm.data?.["slug"];
    return typeof s === "string" && s ? slugify(s) : slugify(doc?.title ?? "untitled");
  };
  const hasLocalImages = issues.some((i) => i.rule === "local-image");
  /** HTML export renders math and diagrams, which load on demand and can fail offline. */
  const exportAsync = (fn: () => Promise<unknown>) =>
    fn().catch((error) => {
      console.error(error);
      toast.error("Couldn't prepare the HTML export. Check your connection and try again.");
    });
  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  /* ---------- library ---------- */
  const newDoc = async (content = "") => {
    const d = await documentStore.create({ content });
    setMobileLibrary(false);
    navigate({ to: "/editor/$docId", params: { docId: d.id } });
  };
  const duplicate = async (d: MdDocument) => {
    const c = await documentStore.create({ content: d.content, images: d.images, title: d.title });
    setMobileLibrary(false);
    navigate({ to: "/editor/$docId", params: { docId: c.id } });
  };
  const [toDelete, setToDelete] = useState<MdDocument | null>(null);
  const remove = async (d: MdDocument) => {
    setToDelete(null);
    await documentStore.remove(d.id);
    const rest = docs.filter((x) => x.id !== d.id);
    if (d.id === docId) {
      if (rest[0]) navigate({ to: "/editor/$docId", params: { docId: rest[0].id } });
      else newDoc(SAMPLE);
    } else refreshList();
  };

  if (missing)
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">This draft doesn't exist in this browser.</p>
        <Button asChild>
          <Link to="/editor">Open my drafts</Link>
        </Button>
      </div>
    );

  const run = (command: Command) => () => editor.current?.run(command);
  /** Applies a pure insertion command to the current selection. */
  const insert = (fn: (snap: Snapshot) => Edit | null) => () => {
    const e = editor.current;
    if (!e) return;
    const edit = fn(e.getSnapshot());
    if (edit) e.apply(edit);
    else e.focus();
  };
  const openLink = () => {
    const e = editor.current;
    if (!e) return;
    const snap = e.getSnapshot();
    const found = findLinkAt(snap);
    const selected = snap.from === snap.to ? "" : snap.text.slice(snap.from, snap.to);
    setLinkDialog({
      open: true,
      found,
      initial: found
        ? { text: found.text, url: found.url, title: found.title, editing: true }
        : { text: selected, url: "", title: "", editing: false },
    });
  };
  const submitLink = (values: Parameters<typeof insertLink>[1]) => {
    const e = editor.current;
    setLinkDialog((d) => ({ ...d, open: false }));
    if (!e) return;
    const { found } = linkDialog;
    e.apply(
      insertLink(e.getSnapshot(), values, found ? { from: found.from, to: found.to } : undefined),
    );
  };
  const openImage = () => {
    const snap = editor.current?.getSnapshot();
    const selected = snap && snap.from !== snap.to ? snap.text.slice(snap.from, snap.to) : "";
    setImageDialog({ open: true, initialAlt: selected });
  };
  const submitImage = async ({ file, ...values }: ImageSubmit) => {
    setImageDialog((d) => ({ ...d, open: false }));
    if (file) return addImages([file], values.alt);
    insert((snap) => insertImage(snap, values))();
  };

  const errCount = issues.filter((i) => i.severity !== "info").length;
  const showLibrary = library && !focus && !compact;
  const showPanel = panel && !focus && !compact;
  const effectiveView = phone && view === "split" ? "editor" : view;
  const activePanel = compact ? mobilePanel : panel;
  const goToLine = (line: number) => {
    setView("editor");
    setMobilePanel(null);
    setTimeout(() => editor.current?.goToLine(line), 100);
  };
  const panelButtons = (
    [
      ["checks", errCount ? AlertTriangle : CheckCircle2, "Checks"],
      ["outline", ListTree, "Outline"],
      ["meta", Tags, "Front matter"],
    ] as const
  ).map(([p, Icon, label]) => (
    <Button
      key={p}
      variant={activePanel === p ? "secondary" : "ghost"}
      size="icon"
      className="relative h-10 w-10 shrink-0"
      onClick={() => (compact ? setMobilePanel(p) : setPanel(panel === p ? null : p))}
      aria-label={label}
      title={label}
    >
      <Icon className="h-4 w-4" />
      {p === "checks" && errCount > 0 && (
        <span className="absolute right-0 top-0 rounded-full bg-warning px-1 text-[10px] text-foreground">
          {errCount}
        </span>
      )}
    </Button>
  ));
  const libraryContent = (
    <aside className="flex min-h-0 flex-1 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Drafts
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10"
          onClick={() => newDoc()}
          aria-label="New draft"
        >
          <FilePlus className="h-4 w-4" />
        </Button>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {docs.map((d) => (
          <div
            key={d.id}
            className={cn(
              "group flex items-center rounded-md",
              d.id === docId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
            )}
          >
            <Link
              to="/editor/$docId"
              params={{ docId: d.id }}
              onClick={() => setMobileLibrary(false)}
              className="min-w-0 flex-1 px-2 py-2"
            >
              <div className="truncate text-sm font-medium">
                {d.id === docId ? doc?.title : d.title}
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(d.updatedAt).toLocaleDateString()}
              </div>
            </Link>
            <div className="flex shrink-0 pr-1 xl:hidden xl:group-hover:flex">
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10"
                onClick={() => duplicate(d)}
                aria-label="Duplicate"
              >
                <CopyPlus className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-destructive"
                onClick={() => setToDelete(d)}
                aria-label="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </nav>
      <p className="border-t border-sidebar-border px-3 py-2 text-xs text-muted-foreground">
        Saved in this browser
      </p>
    </aside>
  );
  const panelContent = (
    <div className="flex-1 overflow-y-auto p-3">
      {activePanel === "checks" && <ChecksPanel issues={issues} onGo={(l) => goToLine(l)} />}
      {activePanel === "outline" &&
        (outline.length ? (
          <ul className="space-y-0.5">
            {outline.map((h, i) => (
              <li key={i}>
                <button
                  className="w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-accent"
                  style={{ paddingLeft: `${(h.depth - 1) * 12 + 8}px` }}
                  onClick={() => goToLine(h.line)}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Add headings to build an outline.</p>
        ))}
      {activePanel === "meta" && (
        <FrontMatterForm
          data={fm.data}
          onChange={(data) => setContent(joinFrontMatter(data, fm.body))}
        />
      )}
    </div>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <div className="studio-shell flex h-dvh flex-col overflow-hidden bg-background text-foreground">
        {/* Top bar */}
        <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b border-border px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => (compact ? setMobileLibrary(true) : setLibrary((v) => !v))}
              aria-label="Toggle drafts"
            >
              <PanelLeft className="h-4 w-4" />
            </Button>
            <Link
              to="/"
              className="min-w-0 truncate font-display text-base font-semibold sm:text-lg"
            >
              <span className="text-primary">md</span>studio
            </Link>
            <span className="ml-2 hidden min-w-0 truncate text-sm text-muted-foreground xl:block">
              / {doc?.title ?? "…"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-10 px-2 sm:px-3"
              aria-label="Import Markdown"
              onClick={() => fileInput.current?.click()}
            >
              <Upload className="h-4 w-4" /> <span className="hidden lg:inline">Import</span>
            </Button>
            <AiWriter
              key={docId}
              content={content}
              onCreate={newDoc}
              onApply={(metadata) => {
                setContent(joinFrontMatter({ ...fm.data, ...metadata }, fm.body));
                if (compact) setMobilePanel("meta");
                else setPanel("meta");
                toast.success("AI suggestions applied to front matter");
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-10 px-2 sm:px-3" aria-label="Export">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Markdown</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => download(`${fileBase()}.md`, out(), "text/markdown;charset=utf-8")}
                >
                  <Download className="h-4 w-4" /> Download .md
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => copy(out(), "Markdown")}>
                  <Copy className="h-4 w-4" /> Copy Markdown
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasLocalImages}
                  onClick={() =>
                    download(`${fileBase()}.md`, out(true), "text/markdown;charset=utf-8")
                  }
                >
                  <ImageIcon className="h-4 w-4" />
                  <div className="flex flex-col">
                    <span>Download self-contained .md</span>
                    <span className="text-xs text-muted-foreground">Images embedded as base64</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasLocalImages}
                  onClick={() => copy(out(true), "Self-contained Markdown")}
                >
                  <Copy className="h-4 w-4" /> Copy self-contained Markdown
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>HTML</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() =>
                    exportAsync(async () => {
                      const { html } = await renderExportBody(out(true), profile, {});
                      await copy(html, "HTML");
                    })
                  }
                >
                  <Copy className="h-4 w-4" /> Copy rendered HTML
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() =>
                    exportAsync(async () =>
                      download(
                        `${fileBase()}.html`,
                        await standaloneDocument(doc?.title ?? "", out(true), profile, {}),
                        "text/html;charset=utf-8",
                      ),
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Download standalone .html
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div
                  className="flex items-center justify-between gap-3 px-2 py-2"
                  onClick={(e) => e.preventDefault()}
                >
                  <Label htmlFor="normalize" className="flex flex-col gap-0.5 text-sm font-normal">
                    Normalize on export
                    <span className="text-xs text-muted-foreground">
                      Consistent bullets, fences and emphasis
                    </span>
                  </Label>
                  <Switch id="normalize" checked={normalize} onCheckedChange={chooseNormalize} />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              onClick={() => setFocus((f) => !f)}
              aria-label="Focus mode"
            >
              {focus ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.mdown,.txt,text/markdown,text/plain"
            multiple
            hidden
            onChange={(e) => {
              onFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Select value={profile} onValueChange={(v) => chooseProfile(v as Profile)}>
              <SelectTrigger
                className="h-10 w-full min-w-0 sm:max-w-[200px] [&_.text-xs]:hidden"
                aria-label="Target platform"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILES.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex shrink-0 items-center gap-1">
              <div className="flex items-center rounded-md border border-border p-0.5">
                {(
                  [
                    ["editor", FileText],
                    ["split", Columns2],
                    ["preview", Eye],
                  ] as const
                ).map(([v, Icon]) => (
                  <Button
                    key={v}
                    variant={effectiveView === v ? "secondary" : "ghost"}
                    size="icon"
                    className={cn("h-10 w-10 shrink-0", v === "split" && "hidden md:inline-flex")}
                    onClick={() => setView(v)}
                    aria-label={`${v} view`}
                    aria-pressed={effectiveView === v}
                    title={`${v} view`}
                  >
                    <Icon className="h-4 w-4" />
                  </Button>
                ))}
              </div>
              {!focus && <div className="hidden md:flex xl:hidden">{panelButtons}</div>}
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Library */}
          {showLibrary && <div className="flex w-60 shrink-0 flex-col">{libraryContent}</div>}

          {/* Editor + preview */}
          <main className="flex min-w-0 flex-1 flex-col">
            {effectiveView !== "preview" && (
              <EditorToolbar
                ref={toolbar}
                editor={editor}
                ctx={ctx}
                profile={profile}
                onOpenLink={openLink}
                onOpenImage={openImage}
                onOpenTable={() => setTableDialog(true)}
                onOpenShortcuts={() => setShortcuts(true)}
              />
            )}
            <div className="flex min-h-0 flex-1">
              {effectiveView !== "preview" && (
                <section
                  className={cn(
                    "min-w-0 bg-paper",
                    effectiveView === "split" ? "w-1/2 border-r border-border" : "flex-1",
                  )}
                >
                  {doc && (
                    <ClientOnly fallback={<EditorFallback />}>
                      <Suspense fallback={<EditorFallback />}>
                        <MarkdownEditor
                          ref={editor}
                          value={content}
                          onChange={setContent}
                          onScrollRatio={onEditorScroll}
                          onPaste={onPaste}
                          onFiles={onFiles}
                          onContext={setCtx}
                          onLinkShortcut={openLink}
                          onFocusToolbar={() => toolbar.current?.focus()}
                          onShowShortcuts={() => setShortcuts(true)}
                        />
                      </Suspense>
                    </ClientOnly>
                  )}
                </section>
              )}
              {effectiveView !== "editor" && (
                <section
                  ref={preview}
                  onScroll={onPreviewScroll}
                  className={cn(
                    "relative min-w-0 overflow-y-auto",
                    effectiveView === "split" ? "w-1/2" : "flex-1",
                  )}
                >
                  <article
                    ref={(el) => {
                      previewBody.current = el;
                      syncPreview(el); // the pane is created fresh when switching views
                    }}
                    className="md-preview mx-auto max-w-180 px-4 py-5 sm:px-8 sm:py-8"
                  />
                </section>
              )}
            </div>
            <footer className="flex min-h-9 shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border px-3 py-1 text-xs text-muted-foreground">
              <span>{stats.words.toLocaleString()} words</span>
              <span>{stats.minutes} min read</span>
              <span>{Object.keys(images).length} images</span>
              <span
                role="status"
                className={cn("ml-auto", saveState === "error" && "text-destructive")}
              >
                {saveState === "saving"
                  ? "Saving…"
                  : saveState === "error"
                    ? "Not saved"
                    : "Saved in this browser"}
              </span>
              <span className="hidden md:inline">
                {PROFILES.find((p) => p.id === profile)?.label}
              </span>
            </footer>
          </main>

          {/* Side panel */}
          {!focus && !compact && (
            <div className="flex shrink-0 border-l border-border">
              {showPanel && (
                <aside className="flex w-72 flex-col overflow-hidden">
                  <div className="border-b border-border px-4 py-3 font-display text-base font-semibold capitalize">
                    {panel === "meta" ? "Front matter" : panel}
                  </div>
                  {panelContent}
                </aside>
              )}
              <div className="flex w-12 flex-col items-center gap-1 py-2">{panelButtons}</div>
            </div>
          )}
        </div>
        {!focus && (
          <nav
            aria-label="Document panels"
            className="flex shrink-0 items-center justify-around border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden"
          >
            {panelButtons}
          </nav>
        )}
        <Dialog open={toDelete !== null} onOpenChange={(open) => !open && setToDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this draft?</DialogTitle>
              <DialogDescription>
                “{toDelete?.title}” will be removed from this browser. This can't be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setToDelete(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => toDelete && remove(toDelete)}>
                Delete draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <LinkDialog
          open={linkDialog.open}
          initial={linkDialog.initial}
          onOpenChange={(open) => setLinkDialog((d) => ({ ...d, open }))}
          onSubmit={submitLink}
          returnFocus={() => editor.current?.focus()}
        />
        <ImageDialog
          open={imageDialog.open}
          initialAlt={imageDialog.initialAlt}
          onOpenChange={(open) => setImageDialog((d) => ({ ...d, open }))}
          onSubmit={submitImage}
          returnFocus={() => editor.current?.focus()}
        />
        <ShortcutsDialog
          open={shortcuts}
          onOpenChange={setShortcuts}
          returnFocus={() => editor.current?.focus()}
        />
        <TableDialog
          open={tableDialog}
          onOpenChange={setTableDialog}
          onSubmit={({ rows, cols }) => {
            setTableDialog(false);
            insert((snap) => insertTable(snap, rows, cols))();
          }}
          returnFocus={() => editor.current?.focus()}
        />
        <Sheet open={compact && mobileLibrary} onOpenChange={setMobileLibrary}>
          <SheetContent
            side="left"
            className="flex h-dvh w-[min(90vw,360px)] flex-col gap-0 p-0"
            aria-describedby={undefined}
          >
            <SheetTitle className="border-b border-border px-4 py-4">Your drafts</SheetTitle>
            {libraryContent}
          </SheetContent>
        </Sheet>
        <Sheet
          open={compact && mobilePanel !== null}
          onOpenChange={(open) => {
            if (!open) setMobilePanel(null);
          }}
        >
          <SheetContent
            side="right"
            className="flex h-dvh w-[min(92vw,380px)] flex-col gap-0 p-0"
            aria-describedby={undefined}
          >
            <SheetTitle className="border-b border-border px-4 py-4 capitalize">
              {mobilePanel === "meta" ? "Front matter" : mobilePanel}
            </SheetTitle>
            {panelContent}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

function EditorFallback() {
  return <div className="p-6 font-mono text-sm text-muted-foreground">Loading editor…</div>;
}

function ChecksPanel({
  issues,
  onGo,
}: {
  issues: ReturnType<typeof checkPortability>;
  onGo: (l: number) => void;
}) {
  if (!issues.length)
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <CheckCircle2 className="h-8 w-8 text-primary" />
        <p className="text-sm font-medium">Portable</p>
        <p className="text-xs text-muted-foreground">
          Nothing here should render differently on your target platform.
        </p>
      </div>
    );
  return (
    <ul className="space-y-2">
      {issues.map((i, k) => {
        const Icon =
          i.severity === "error" ? CircleAlert : i.severity === "warning" ? AlertTriangle : Info;
        return (
          <li key={k}>
            <button
              onClick={() => onGo(i.line)}
              className="flex w-full gap-2 rounded-md border border-border bg-card p-2.5 text-left hover:bg-accent"
            >
              <Icon
                className={cn(
                  "mt-0.5 h-4 w-4 shrink-0",
                  i.severity === "error"
                    ? "text-destructive"
                    : i.severity === "warning"
                      ? "text-warning"
                      : "text-info",
                )}
              />
              <span className="text-sm leading-snug">
                <span className="mr-1 font-mono text-xs text-muted-foreground">L{i.line}</span>
                {i.message}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FrontMatterForm({
  data,
  onChange,
}: {
  data: Record<string, unknown> | null;
  onChange: (d: Record<string, unknown> | null) => void;
}) {
  if (!data)
    return (
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Blog platforms and static site generators read a YAML block at the top of the file for the
          title, tags and more.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            onChange({ title: "Untitled post", date: new Date().toISOString().slice(0, 10) })
          }
        >
          Add front matter
        </Button>
      </div>
    );
  const str = (k: string) =>
    typeof data[k] === "string" || typeof data[k] === "number"
      ? String(data[k])
      : data[k] instanceof Date
        ? (data[k] as Date).toISOString().slice(0, 10)
        : "";
  const set = (k: string, v: unknown) => onChange({ ...data, [k]: v });
  const tags = Array.isArray(data["tags"]) ? (data["tags"] as unknown[]).join(", ") : str("tags");
  return (
    <div className="space-y-3">
      {(["title", "slug", "date", "cover"] as const).map((k) => (
        <div key={k} className="space-y-1">
          <Label htmlFor={`fm-${k}`} className="capitalize">
            {k === "cover" ? "Cover image URL" : k}
          </Label>
          <Input
            id={`fm-${k}`}
            type={k === "date" ? "date" : "text"}
            value={str(k)}
            onChange={(e) => set(k, e.target.value)}
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label htmlFor="fm-description">Description</Label>
        <Textarea
          id="fm-description"
          rows={3}
          value={str("description")}
          onChange={(e) => set("description", e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="fm-tags">Tags</Label>
        <Input
          id="fm-tags"
          placeholder="markdown, writing"
          defaultValue={tags}
          onBlur={(e) =>
            set(
              "tags",
              e.target.value
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            )
          }
        />
        <p className="text-xs text-muted-foreground">Comma separated</p>
      </div>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onChange(null)}>
        Remove front matter
      </Button>
    </div>
  );
}
