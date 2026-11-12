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
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VersionTag } from "@/components/VersionTag";
import { AccountMenu } from "@/components/studio/AccountMenu";
import { cloudReady, useAccount } from "@/lib/account/store";
import { askToConfirmEmail } from "@/lib/account/verify-prompt";
import { ReviewComments } from "@/components/studio/ReviewComments";
import { PUBLISH_AFTER_CONNECT, PublishDialog } from "@/components/studio/PublishDialog";
import { CollabStatus } from "@/components/studio/CollabStatus";
import { useCollabSession, useSessionState } from "@/lib/collab/hooks";
import { ShareDialog } from "@/components/studio/ShareDialog";
import { clearShares, useShares } from "@/lib/share/hooks";
import {
  addToCloud,
  removeFromCloud,
  requestSync,
  syncLabel,
  syncNow,
  useCloud,
  useSync,
} from "@/lib/sync/hooks";
import { type CloudRevision, fetchCloudRevision, listCloudRevisions } from "@/lib/sync/revisions";
import { cloudOwners, isVisible } from "@/lib/sync/meta";
import { ClientOnly, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Image as ImageIcon,
  Upload,
  Archive,
  SlidersHorizontal,
  FolderUp,
  Share2,
  Github,
  FileUp,
  MonitorDown,
  Download,
  Copy,
  Columns2,
  PanelLeft,
  FileText,
  Eye,
  AlertTriangle,
  Info,
  CircleAlert,
  CheckCircle2,
  ListTree,
  Tags,
  History,
  MessageSquare,
  Sparkles,
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
import { SiteNotice } from "@/components/SiteNotice";
import { cn } from "@/lib/utils";
import { CHECKS_OPEN_MIN_WIDTH, clampLibraryWidth, LIBRARY_WIDTH } from "@/lib/ui/layout";
import { HistoryPanel } from "@/components/studio/HistoryPanel";
import { Library } from "@/components/studio/Library";
import { historyStore, type Revision } from "@/lib/storage/history";
import { normalizeFolder, resolveFolder } from "@/lib/storage/library";
import { runChecks } from "@/lib/checker/run";
import { loadConfig, saveConfig } from "@/lib/checker/storage";
import { DEFAULT_CONFIG, type CheckConfig } from "@/lib/checker/config";
import { RulesDialog } from "@/components/studio/RulesDialog";
import { buildArchive, parseArchive, type ImportedDoc } from "@/lib/storage/archive";
import { useInstallPrompt, useOnline } from "@/lib/pwa/hooks";
import { createZip, readZip, ZIP_LIMITS, type ZipEntry } from "@/lib/storage/zip";
import {
  documentStore,
  docTitle,
  indexedDbStore,
  emptyDocument,
  NEW_DOC_ID,
  sampleDocument,
  type MdDocument,
} from "@/lib/storage/documentStore";
import { compressImage, kb, safeImageName } from "@/lib/editor/images";
import { rewriteImageRefs, shrinkImage } from "@/lib/editor/shrink";
import { imageMessage, uploadImage } from "@/lib/account/assets";
import { dataUriToBytes } from "@/lib/storage/archive";
import {
  PROFILES,
  type Profile,
  renderMarkdown,
  type Issue,
  getOutline,
  getStats,
  deriveTitle,
  isHttpUrl,
  slugify,
  finalizeText,
  normalizeMarkdown,
  embedImages,
  htmlToMarkdown,
  supports,
  splitFrontMatter,
  joinFrontMatter,
} from "@/lib/markdown/markdown";
import { parseProfile } from "@/lib/markdown/profiles";
import type { Command, Context, Edit, Snapshot } from "@/lib/editor/editing";
import { findLinkAt, insertImage, insertLink, type FoundLink } from "@/lib/editor/editing-insert";
import { hydrateDiagrams, renderDiagramFor, withCachedDiagrams } from "@/lib/markdown/diagrams";
import { useResolvedTheme } from "@/lib/ui/useResolvedTheme";
import { renderExportBody, standaloneDocument } from "@/lib/markdown/export";
import { ensureMath, hasMathSyntax, isMathLoaded } from "@/lib/markdown/math";
import { patchHtml } from "@/lib/markdown/preview-dom";
import { blockAtLine, lineOfTarget, previewBlocks } from "@/lib/markdown/source-lines";
import { buildAnchors, lineToY, yToLine, type Anchors } from "@/lib/markdown/scroll-map";
import { insertTable } from "@/lib/editor/tables";
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
import { AiEditDialog, type AiEdit } from "./AiEditDialog";
import { canFix, fixInstruction, fixTarget } from "@/lib/ai/fix";
import { AiMenuItems } from "./AiMenuItems";
import { AiIntegrationsDialog } from "./AiIntegrationsDialog";
import type { AiActionId } from "@/lib/ai/actions";
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
const noop = () => undefined;
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
type Panel = "checks" | "outline" | "meta" | "history" | "comments" | null;

function download(name: string, data: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readFile(file: File) {
  return file.text();
}

export function Studio({ docId }: { docId: string }) {
  const navigate = useNavigate();
  // effects use it without depending on it: its identity changes with every route change
  const go = useRef(navigate);
  go.current = navigate;
  // The studio is a fixed app shell: only the panes inside it scroll, never the page.
  useEffect(() => {
    document.documentElement.classList.add("studio-open");
    return () => document.documentElement.classList.remove("studio-open");
  }, []);
  const [doc, setDoc] = useState<MdDocument | null>(null);
  const [docs, setDocs] = useState<MdDocument[]>([]);
  const [missing, setMissing] = useState(false);
  const [profile, setProfile] = useState<Profile>("gfm-extended");
  const [view, setView] = useState<View>("split");
  const [panel, setPanel] = useState<Panel>(null);
  const [library, setLibrary] = useState(true);
  const [libraryWidth, setLibraryWidth] = useState<number>(LIBRARY_WIDTH.default);
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
  const [aiEdit, setAiEdit] = useState<(AiEdit & { from: number; to: number }) | null>(null);
  const [aiIntegrations, setAiIntegrations] = useState(false);
  const [selRect, setSelRect] = useState<{ x: number; top: number; bottom: number } | null>(null);
  const toolbar = useRef<ToolbarHandle>(null);
  const [compact, setCompact] = useState(false);
  const [phone, setPhone] = useState(false);
  const [mobileLibrary, setMobileLibrary] = useState(false);
  // the panel only exists on phones and in focus mode; leaving both closes it for good
  useEffect(() => {
    if (!compact && !focus) setMobileLibrary(false);
  }, [compact, focus]);
  // Panels open beside the editor, except on phones and in focus mode, where they open as a panel
  // from the right so the writing area never shrinks. Leaving both closes the panel for good.
  const overlay = compact || focus;
  useEffect(() => {
    if (!overlay) setMobilePanel(null);
  }, [overlay]);
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
  const [checkConfig, setCheckConfig] = useState<CheckConfig>(DEFAULT_CONFIG);
  const [rulesOpen, setRulesOpen] = useState(false);
  const editor = useRef<EditorHandle>(null);
  const startAi = (action: AiActionId) => {
    const snap = editor.current?.getSnapshot();
    if (!snap || snap.from === snap.to) {
      toast.info("Select some text first");
      return;
    }
    setSelRect(null);
    setAiEdit({ action, text: snap.text.slice(snap.from, snap.to), from: snap.from, to: snap.to });
  };
  /** Asks the AI to fix one flagged problem, in the paragraph, code block or front matter it is in. */
  const fixIssue = (issue: Issue) => {
    const target = fixTarget(content, issue);
    if (!target) {
      toast.info("Couldn't find the text for this check");
      return;
    }
    setAiEdit({
      ...target,
      label: issue.rule === "missing-alt" ? "Suggest alt text" : "Fix with AI",
      instruction: fixInstruction(issue, profile),
    });
  };
  /** Puts the suggestion where the selection was, in one step, unless that text has changed meanwhile. */
  const acceptAi = (insert: string) => {
    const e = editor.current;
    if (!e || !aiEdit) return;
    const { text, from, to } = aiEdit;
    if (e.getSnapshot().text.slice(from, to) !== text) {
      toast.error("The selected text changed, so nothing was replaced");
      return;
    }
    e.apply({ changes: [{ from, to, insert }], from, to: from + insert.length });
    setAiEdit(null);
    toast.success("AI suggestion applied", { description: "Undo puts the old text back." });
  };
  const preview = useRef<HTMLDivElement>(null);
  const install = useInstallPrompt();
  const online = useOnline();
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  // When one pane scrolls the other, the other's scroll event is an echo of that and must not scroll
  // the first one back. Only that echo is ignored (matched by position), so the user's own scrolling
  // is never dropped.
  const driven = useRef<{ pane: "editor" | "preview"; top: number; at: number } | null>(null);
  const drive = (pane: "editor" | "preview", top: number) => {
    driven.current = { pane, top, at: Date.now() };
  };
  const isEcho = (pane: "editor" | "preview", top: number) => {
    const d = driven.current;
    if (!d || d.pane !== pane) return false;
    if (Date.now() - d.at > 300 || Math.abs(top - d.top) > 2) {
      driven.current = null;
      return false;
    }
    driven.current = null;
    return true;
  };

  // load prefs + docs
  useEffect(() => {
    const p = parseProfile(localStorage.getItem("md:profile"));
    if (p) setProfile(p);
    setNormalize(localStorage.getItem("md:normalize") === "1");
    setCheckConfig(loadConfig());
    // Checks start open only on wide screens; below that the editor keeps the room until asked.
    if (window.matchMedia(`(min-width: ${CHECKS_OPEN_MIN_WIDTH}px)`).matches) setPanel("checks");
    const w = localStorage.getItem("md:library-width");
    if (w) setLibraryWidth(clampLibraryWidth(w));
  }, []);
  // Saved where the choice is made, not in an effect: an effect on mount would overwrite the
  // stored value with the default before (or while) it is loaded.
  const chooseProfile = (p: Profile) => {
    setProfile(p);
    localStorage.setItem("md:profile", p);
  };
  const resizeLibrary = (width: number, save = true) => {
    const w = clampLibraryWidth(width);
    setLibraryWidth(w);
    if (save) localStorage.setItem("md:library-width", String(w));
    return w;
  };
  const chooseCheckConfig = (config: CheckConfig) => {
    setCheckConfig(config);
    saveConfig(config);
  };
  const chooseNormalize = (on: boolean) => {
    setNormalize(on);
    localStorage.setItem("md:normalize", on ? "1" : "0");
  };

  const [folderNames, setFolderNames] = useState<string[]>([]);
  // A draft kept in the cloud belongs to its account: it is hidden while anyone else, or nobody,
  // is signed in. Until the server has answered, nothing that belongs to an account is shown.
  const accountState = useAccount();
  const { user: account, loaded: accountLoaded, images: hostingOn, githubPublish } = accountState;
  // The cloud is open to accounts whose email is confirmed (or when this server sends no mail).
  const cloudOn = cloudReady(accountState);
  const visibleTo = useRef<string | undefined>(undefined);
  visibleTo.current = account?.id;
  const refreshList = useCallback(
    () =>
      Promise.all([
        documentStore.list(),
        documentStore.folders.list(),
        cloudOwners(indexedDbStore),
      ]).then(([d, f, owners]) => {
        setDocs(d.filter((x) => isVisible(owners, x.id, visibleTo.current)));
        setFolderNames(f);
      }),
    [],
  );
  // The example (first visit) or a blank draft shown when nothing is stored (docId "new"). It lives
  // in memory only: it is saved when the writer first changes it, and dropped if drafts of their own turn up (signing in).
  const example = useRef<{ doc: MdDocument } | null>(null);
  // the id of a draft this studio just saved as its own and navigated to, so it is not reloaded
  const adopted = useRef<string | null>(null);
  useEffect(() => {
    if (!accountLoaded) return;
    setMissing(false);
    if (adopted.current === docId) {
      adopted.current = null;
      refreshList();
      return;
    }
    if (docId === NEW_DOC_ID) {
      // drop the draft that was open (a deleted one, say) so the editor never mounts with its text
      // and then reports the swap to the blank one as an edit
      setDoc(null);
      Promise.all([
        documentStore.list(),
        cloudOwners(indexedDbStore),
        documentStore.hadDraft(),
      ]).then(([all, owners, had]) => {
        const own = all.find((x) => isVisible(owners, x.id, account?.id));
        if (own) {
          example.current = null;
          go.current({ to: "/editor/$docId", params: { docId: own.id }, replace: true });
          return;
        }
        // the example is for a first visit; after that, nothing is shown that they did not write
        const sample = had ? emptyDocument() : sampleDocument();
        example.current = { doc: sample };
        setDoc(sample);
      });
      refreshList();
      return;
    }
    example.current = null;
    Promise.all([documentStore.get(docId), cloudOwners(indexedDbStore)]).then(([d, owners]) => {
      if (d && isVisible(owners, d.id, account?.id)) setDoc(d);
      else {
        setDoc(null);
        setMissing(true);
      }
    });
    refreshList();
  }, [docId, refreshList, accountLoaded, account?.id]);
  // Drafts arriving while the example is open (a sign-in pulling the cloud) replace it. The list in
  // memory only says "look": the store decides, because a stale list can still name a draft that
  // was just deleted.
  useEffect(() => {
    if (docId !== NEW_DOC_ID || !docs[0] || !doc || example.current?.doc !== doc) return;
    let live = true;
    Promise.all([documentStore.list(), cloudOwners(indexedDbStore)]).then(([all, owners]) => {
      const own = all.find((x) => isVisible(owners, x.id, visibleTo.current));
      if (!live || !own || example.current?.doc !== doc) return;
      example.current = null;
      go.current({ to: "/editor/$docId", params: { docId: own.id }, replace: true });
    });
    return () => {
      live = false;
    };
  }, [docs, docId, doc]);

  // autosave: debounced, but any unsaved draft is flushed before it can be lost
  const [historyVersion, setHistoryVersion] = useState(0);
  const [revisions, setRevisions] = useState<Revision[]>([]);
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
      .then(() => {
        // the example just became a draft: carry on in it, under its own address
        if (example.current?.doc.id !== d.id) return;
        example.current = null;
        adopted.current = d.id;
        go.current({ to: "/editor/$docId", params: { docId: d.id }, replace: true });
      })
      .then(() =>
        historyStore
          .maybeSnapshot(d, Date.now())
          .then((r) => r && setHistoryVersion((v) => v + 1))
          .catch((error) => console.error("Couldn't keep a version of this draft", error)),
      )
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
    // the example is not saved until it has been changed
    if (example.current?.doc === doc) return;
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

  // Optional account sync of the drafts chosen for the cloud: a no-op while signed out. Cloud
  // changes to the open draft wait while it has unsaved edits, then load into the editor.
  const syncStatus = useSync(cloudOn ? account?.id : undefined, {
    isBusy: (id) => pending.current?.id === id,
    onReport: (report) => {
      if (report.applied.length || report.removed.length || report.detached.length)
        void refreshList();
      if (report.applied.includes(docId)) void documentStore.get(docId).then((d) => d && setDoc(d));
      if (report.removed.includes(docId)) setMissing(true);
      if (report.replaced.length)
        toast.info(
          `A newer edit from another device replaced ${report.replaced.length === 1 ? "a draft" : `${report.replaced.length} drafts`}`,
          {
            id: "sync-replaced",
            description: "The text it replaced is in the draft's History.",
          },
        );
      if (report.detached.length)
        toast.info("A draft is no longer in your cloud", {
          id: "sync-detached",
          description:
            "It was deleted on another device after you edited it here, so it stays on this device only.",
        });
      if (report.overLimit.length)
        toast.error("Your cloud is full", {
          id: "sync-full",
          description: `${report.overLimit.length === 1 ? "A draft" : `${report.overLimit.length} drafts`} stayed on this device only. Remove a draft from the cloud to make room.`,
        });
      if (report.tooLarge.length)
        toast.error("A draft is too large for the cloud", {
          id: "sync-large",
          description: "Drafts over 1 MB of text stay on this device.",
        });
    },
  });
  const cloudDrafts = useCloud();
  // A draft shared for editing is live: its text is a shared document the room holds, and this
  // browser edits it through a session. Until the text has arrived the draft is shown, not editable.
  const liveTarget =
    cloudOn && account && doc && cloudDrafts.live.has(doc.id)
      ? { ownerId: account.id, draftId: doc.id }
      : null;
  const openSession = useCollabSession(liveTarget, (text) => {
    // this browser kept state of an earlier room: its text is not lost, it is in History
    if (doc) void historyStore.save({ ...doc, content: text }, Date.now(), "replaced");
  });
  // the session of the draft on screen, not of the one just left (it closes a moment later)
  const collab = openSession && openSession.draftId === doc?.id ? openSession : null;
  const collabState = useSessionState(collab);
  const collabReady = !!collab && collabState.ready;
  // The live editor opens once the draft's saved copy shows the room's text (see below).
  const [mirrored, setMirrored] = useState(false);
  const waiting = !!liveTarget && !(collabReady && mirrored);
  useEffect(() => {
    if (!collab || !collabReady) return;
    const id = collab.draftId;
    const mirror = (text: string) =>
      setDoc((d) => {
        if (!d || d.id !== id || d.content === text) return d;
        const next = { ...d, content: text, updatedAt: Date.now() };
        next.title = docTitle(next);
        return next;
      });
    mirror(collab.text());
    setMirrored(true);
    // the saved copy follows everyone's edits, so the library, the preview and export keep working offline
    const stop = collab.observe(mirror);
    return () => {
      stop();
      setMirrored(false);
    };
  }, [collab, collabReady]);
  // not shared any more (stopped, removed, deleted): the cloud is asked what became of it
  useEffect(() => {
    if (collabState.status === "ended") requestSync(0);
  }, [collabState.status]);
  // The account's share links are read when something asks for them (the Share dialog, the
  // Comments panel), never in the background, so they cost nothing until used.
  useEffect(() => {
    if (!cloudOn || !account?.id) clearShares();
  }, [cloudOn, account?.id]);

  const historyOpen = (overlay ? mobilePanel : panel) === "history";
  // The versions the cloud keeps for this draft: read while History is open, and again after each
  // sync, since that is when the server may have kept another one.
  const [cloudRevs, setCloudRevs] = useState<{ items: CloudRevision[]; max: number } | null>(null);
  const inCloud = !!doc && cloudOn && cloudDrafts.linked.has(doc.id);
  useEffect(() => {
    if (!historyOpen || !inCloud || !doc || !account) return setCloudRevs(null);
    let live = true;
    void listCloudRevisions(account.id, doc.id).then(
      (r) => live && setCloudRevs(r ? { items: r.revisions, max: r.max } : null),
    );
    return () => {
      live = false;
    };
    // keyed on the draft's id and the sync time, not on the objects that change on every keystroke
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyOpen, inCloud, doc?.id, account?.id, syncStatus.at]);
  useEffect(() => {
    if (!historyOpen || !doc?.id) return;
    let live = true;
    historyStore.list(doc.id).then((r) => live && setRevisions(r));
    return () => {
      live = false;
    };
  }, [historyOpen, doc?.id, historyVersion]);

  const update = useCallback((patch: Partial<MdDocument>) => {
    setDoc((d) => {
      if (!d) return d;
      const next = { ...d, ...patch, updatedAt: Date.now() };
      next.title = docTitle(next);
      return next;
    });
  }, []);
  // In a live draft a new text (a restored version, the front matter form, an AI edit) is a small
  // edit of the shared one, so what others typed meanwhile is kept.
  const setContent = useCallback(
    (content: string) =>
      collabReady && collab ? collab.replaceText(content) : update({ content }),
    [update, collab, collabReady],
  );

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
  // Diagram colors are baked into their SVG, so a theme change re-renders them.
  const theme = useResolvedTheme();
  const html = useMemo(() => {
    const rendered = renderMarkdown(deferred, profile, images, { sourceLines: true });
    // known diagrams go straight into the HTML so they never show up as code while typing
    return supports("mermaid", profile) ? withCachedDiagrams(rendered, theme) : rendered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferred, profile, images, mathVersion, theme]);
  // Only the blocks that changed are replaced (see patchHtml), then pending diagrams render.
  // This runs before paint, so the preview never shows an intermediate state.
  const previewBody = useRef<HTMLElement | null>(null);
  const htmlRef = useRef(html);
  htmlRef.current = html;
  // Click-through sync: the editor cursor's block is marked in the preview, and a click on a block
  // in the preview puts the cursor on that block's first line.
  const effectiveView = phone && view === "split" ? "editor" : view;
  const [cursorLine, setCursorLine] = useState(1);
  // Images loading, fonts and a resized window change block heights without any re-render.
  useEffect(() => {
    const root = previewBody.current;
    if (!root) return;
    const watch = new ResizeObserver(() => {
      anchors.current = undefined;
    });
    watch.observe(root);
    return () => watch.disconnect();
  }, [effectiveView]);
  useEffect(() => {
    const root = previewBody.current;
    if (!root) return;
    root.querySelectorAll("[data-active]").forEach((n) => n.removeAttribute("data-active"));
    if (effectiveView === "preview") return;
    const block = blockAtLine(root, cursorLine);
    if (!block) return;
    block.setAttribute("data-active", "");
    // bring the block into view without the scroll echoing back to the editor
    const scroller = preview.current;
    block.scrollIntoView({ block: "nearest" });
    if (scroller) drive("preview", scroller.scrollTop);
  }, [cursorLine, html, effectiveView]);
  const onPreviewClick = (e: React.MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0) return;
    const target = e.target as Element;
    // leave links and controls alone, and never interrupt selecting text to copy it
    if (target.closest("a, button, input, summary, textarea")) return;
    if (!window.getSelection()?.isCollapsed) return;
    const root = previewBody.current;
    const line = root ? lineOfTarget(target, root) : null;
    if (line === null) return;
    if (effectiveView === "preview") {
      // the editor is hidden: bring it back, then place the cursor once it has mounted
      setView(phone ? "editor" : "split");
      setTimeout(() => editor.current?.placeCursor(line), 150);
    } else editor.current?.placeCursor(line);
  };
  const syncPreview = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      patchHtml(el, htmlRef.current);
      anchors.current = undefined; // block heights may have changed
      if (supports("mermaid", profile))
        hydrateDiagrams(el, renderDiagramFor(theme)).catch((e) => console.error(e));
    },
    [profile, theme],
  );
  useLayoutEffect(() => syncPreview(previewBody.current), [html, syncPreview]);
  const issues = useMemo(
    () => runChecks(deferred, profile, checkConfig).issues,
    [deferred, profile, checkConfig],
  );
  const outline = useMemo(() => getOutline(deferred), [deferred]);
  const stats = useMemo(() => getStats(deferred), [deferred]);
  const fm = useMemo(() => splitFrontMatter(content), [content]);

  /* ---------- scroll sync ---------- */
  // The two panes are kept at the same place in the text, line by line (see scroll-map.ts); a
  // plain percentage drifts because code blocks and lists grow at different rates in each pane.
  const anchors = useRef<Anchors | null | undefined>(undefined);
  const getAnchors = () => {
    if (anchors.current === undefined) {
      const root = previewBody.current;
      const scroller = preview.current;
      anchors.current = root && scroller ? buildAnchors(previewBlocks(root, scroller)) : null;
    }
    return anchors.current;
  };
  const onEditorScroll = ({
    line,
    ratio,
    atEnd,
    top,
  }: {
    line: number;
    ratio: number;
    atEnd: boolean;
    top: number;
  }) => {
    if (isEcho("editor", top)) return;
    const el = preview.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const map = getAnchors();
    el.scrollTop = atEnd ? max : map ? Math.min(max, lineToY(map, line)) : ratio * max;
    drive("preview", el.scrollTop);
  };
  const onPreviewScroll = () => {
    const el = preview.current;
    if (!el || isEcho("preview", el.scrollTop)) return;
    const max = el.scrollHeight - el.clientHeight;
    const map = getAnchors();
    const top =
      max > 0 && el.scrollTop >= max - 1
        ? editor.current?.scrollToRatio(1)
        : map
          ? editor.current?.scrollToLine(yToLine(map, el.scrollTop))
          : editor.current?.scrollToRatio(max > 0 ? el.scrollTop / max : 0);
    if (top !== undefined) drive("editor", top);
  };

  /* ---------- import ---------- */
  /** Creates drafts (with their folders and images) and opens the first one. */
  const importDrafts = async (items: ImportedDoc[]) => {
    if (!items.length) return;
    const known = [...folderNames, ...docs.flatMap((x) => x.folder ?? [])];
    let first: MdDocument | undefined;
    for (const item of items) {
      const folder = resolveFolder(item.folder, known);
      if (folder && !known.includes(folder)) {
        known.push(folder);
        await documentStore.folders.add(folder);
      }
      const titled = deriveTitle(item.content) !== "Untitled";
      const d = await documentStore.create({
        content: item.content,
        images: item.images,
        title: item.title,
        // no heading or title in the text: keep the file's name instead of "Untitled"
        ...(titled ? {} : { name: item.title }),
        folder,
      });
      first ??= d;
    }
    toast.success(
      items.length === 1 ? `Imported ${items[0]!.title}` : `Imported ${items.length} drafts`,
    );
    await refreshList();
    if (first) navigate({ to: "/editor/$docId", params: { docId: first.id } });
  };

  // In a cloud draft an image is uploaded and linked by its public address, so the Markdown works
  // on other platforms too. Anywhere else, or when the upload fails, it stays in the draft.
  const addImages = async (files: File[], alt?: string) => {
    if (!doc) return;
    const hosted = hostingOn && cloudDrafts.linked.has(doc.id);
    const next = { ...doc.images };
    const refs: string[] = [];
    const labelOf = (name: string) =>
      ((files.length === 1 && alt) || name.replace(/\.[a-z0-9]+$/, "")).replace(/[[\]]/g, "\\$&");
    for (const f of files) {
      if (hosted) {
        const sent = await hostFile(f);
        if (sent) {
          refs.push(`![${labelOf(f.name || "image")}](${sent})`);
          continue;
        }
      }
      const data = await compressImage(f);
      const name = safeImageName(f.name || "pasted.png", next);
      next[name] = data;
      refs.push(`![${labelOf(name)}](./images/${name})`);
      if (kb(data) > 500)
        toast.warning(`${name} is ${kb(data)} KB. Large embedded images make the file heavy.`);
    }
    if (Object.keys(next).length !== Object.keys(doc.images).length) update({ images: next });
    editor.current?.insert(refs.join("\n"));
  };

  /** Shrinks and uploads one image; the hosted link, or null (after saying why). */
  const hostFile = async (file: File): Promise<string | null> => {
    try {
      const small = await shrinkImage(file);
      if (!small) {
        toast.error("That image is too large to host", {
          description: "It was added to the draft instead.",
        });
        return null;
      }
      const result = await uploadImage(small);
      if ("image" in result) {
        toast.success(`Image hosted (${Math.max(1, Math.round(result.image.byteSize / 1024))} KB)`);
        return result.image.url;
      }
      toast.error(imageMessage(result.error), {
        description: "It was added to the draft instead.",
      });
    } catch (error) {
      console.error(error);
      toast.error("Couldn't prepare that image for hosting", {
        description: "It was added to the draft instead.",
      });
    }
    return null;
  };

  /** Moves a cloud draft's local images to hosting and points the text at the hosted links. */
  const hostImages = async (d: MdDocument) => {
    const names = Object.keys(d.images).filter((n) => d.content.includes(`images/${n}`));
    const links: Record<string, string> = {};
    for (const name of names) {
      const parsed = dataUriToBytes(d.images[name]!);
      if (!parsed) continue;
      const file = new File([parsed.bytes as BlobPart], name, { type: parsed.mime });
      const url = await hostFile(file);
      if (!url) break; // full or offline: keep the rest as they are
      links[name] = url;
    }
    const done = Object.keys(links).length;
    if (!done) return;
    const images = Object.fromEntries(Object.entries(d.images).filter(([n]) => !(n in links)));
    const next = {
      ...d,
      content: rewriteImageRefs(d.content, links),
      images,
      updatedAt: Date.now(),
    };
    next.title = docTitle(next);
    await documentStore.save(next);
    if (d.id === doc?.id) {
      setDoc(next);
      if (collabReady && collab) collab.replaceText(next.content);
    }
    await refreshList();
    toast.success(`Hosted ${done} image${done === 1 ? "" : "s"}`, {
      description: "The draft now links to them by address. Ctrl/⌘+Z undoes the text change.",
    });
  };

  const onFiles = async (files: File[]) => {
    const zips = files.filter((f) => /\.zip$/i.test(f.name) || f.type === "application/zip");
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    const texts = files.filter(
      (f) =>
        !zips.includes(f) &&
        (/\.(md|markdown|mdown|txt)$/i.test(f.name) || f.type.startsWith("text/")),
    );
    if (imgs.length) await addImages(imgs);
    const found: ImportedDoc[] = [];
    try {
      for (const z of zips) {
        const { docs: inZip, skipped } = parseArchive(
          await readZip(new Uint8Array(await z.arrayBuffer())),
        );
        if (!inZip.length) toast.error(`No Markdown files found in ${z.name}`);
        else if (skipped)
          toast.info(`Skipped ${skipped} file${skipped === 1 ? "" : "s"} that aren't Markdown`);
        found.push(...inZip);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't read that ZIP file");
      return;
    }
    for (const t of texts) {
      const name = t.name.replace(/\.[^.]+$/, "");
      const content = await readFile(t);
      found.push({
        title: deriveTitle(content) === "Untitled" ? name : deriveTitle(content),
        content,
        images: {},
      });
    }
    await importDrafts(found);
    if (!imgs.length && !found.length && !zips.length)
      toast.error("Only Markdown, text, image or ZIP files can be dropped here.");
  };

  /** A picked folder: its Markdown files and the images they use, keeping the folder structure. */
  const onFolder = async (files: File[]) => {
    const wanted = files.filter((f) =>
      /\.(md|markdown|mdown|txt|png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(f.name),
    );
    if (wanted.length > ZIP_LIMITS.entries) {
      toast.error(`That folder has too many files (more than ${ZIP_LIMITS.entries})`);
      return;
    }
    if (wanted.reduce((n, f) => n + f.size, 0) > ZIP_LIMITS.totalBytes) {
      toast.error("That folder is too large to import");
      return;
    }
    const entries: ZipEntry[] = await Promise.all(
      wanted.map(async (f) => ({
        path: f.webkitRelativePath || f.name,
        data: new Uint8Array(await f.arrayBuffer()),
      })),
    );
    const { docs: found } = parseArchive(entries);
    if (!found.length) toast.error("No Markdown files found in that folder");
    await importDrafts(found);
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
  const exportAll = async () => {
    const all = libraryDocs;
    const zip = await createZip(
      buildArchive(
        all.map((d) => ({
          title: d.title,
          content: d.content,
          images: d.images,
          folder: d.folder,
        })),
      ),
    );
    download(
      `mdstudio-drafts-${new Date().toISOString().slice(0, 10)}.zip`,
      zip as BlobPart,
      "application/zip",
    );
    toast.success(`Exported ${all.length} draft${all.length === 1 ? "" : "s"}`);
  };
  const fileBase = () => {
    const s = fm.data?.["slug"];
    return typeof s === "string" && s ? slugify(s) : slugify(doc?.title ?? "untitled");
  };
  const hasLocalImages = issues.some((i) => i.rule === "local-image");
  /** Plain exports keep `./images/...` paths, which only mean something inside this draft. */
  const warnLocalImages = () => {
    const n = issues.filter((i) => i.rule === "local-image").length;
    if (!n) return;
    toast.warning(
      `${n} image${n === 1 ? " points" : "s point"} to files that only exist in this draft`,
      {
        id: "export-local-images",
        description:
          "Anywhere else they show as missing. Use the self-contained export, or replace them with image URLs.",
      },
    );
  };
  /** HTML export renders math and diagrams, which load on demand and can fail offline. */
  const exportAsync = (fn: () => Promise<unknown>) =>
    fn().catch((error) => {
      console.error(error);
      toast.error(
        "Couldn't prepare the export. Try again, and check your connection if it includes math or diagrams.",
      );
    });
  const copy = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  /* ---------- history ---------- */
  const saveVersion = async () => {
    if (!doc) return;
    const rev = await historyStore.save(doc, Date.now(), "manual");
    if (rev) setHistoryVersion((v) => v + 1);
    toast.success(rev ? "Version saved" : "Nothing new to save since the last version");
  };
  const restoreVersion = async (rev: Revision) => {
    if (!doc) return;
    // keep what is being replaced, so a restore can itself be undone
    await historyStore.save(doc, Date.now(), "restore");
    setContent(rev.content);
    setHistoryVersion((v) => v + 1);
    toast.success("Version restored", {
      description: "The text it replaced is in History, in case you want it back.",
    });
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
  const libraryDocs = useMemo(
    () => docs.map((d) => (d.id === doc?.id ? { ...d, ...doc } : d)),
    [docs, doc],
  );
  /** Applies a library-only change to a draft, on screen or in storage. */
  const patchDraft = async (d: MdDocument, patch: Partial<MdDocument>) => {
    if (d.id === doc?.id) return update(patch);
    const saved = { ...d, ...patch };
    await documentStore.save({ ...saved, title: docTitle(saved) });
    refreshList();
  };
  const rename = (d: MdDocument, name: string) => {
    if (name.trim() === (d.name ?? "").trim()) return;
    return patchDraft(d, { name: name.trim() });
  };
  const move = async (d: MdDocument, folder: string | undefined) => {
    const target = resolveFolder(folder, [...folderNames, ...docs.flatMap((x) => x.folder ?? [])]);
    if (target === d.folder) return;
    if (target) await documentStore.folders.add(target);
    return patchDraft(d, { folder: target });
  };
  const createFolder = async (name: string) => {
    const existing = [...folderNames, ...docs.flatMap((x) => x.folder ?? [])];
    const target = resolveFolder(name, existing);
    if (!target) return;
    if (existing.includes(target)) {
      toast.info(`A folder named “${target}” already exists`);
      return;
    }
    await documentStore.folders.add(target);
    refreshList();
  };
  const [toDelete, setToDelete] = useState<MdDocument | null>(null);
  // what is shared or published is the cloud's copy, so it is brought up to date first
  const bringCloudUpToDate = async () => {
    await flush();
    if (account) await syncNow(account.id);
  };
  // the draft whose share dialog is open
  const [shareTarget, setShareTarget] = useState<MdDocument | null>(null);
  // the draft whose publish-to-GitHub dialog is open
  const [publishTarget, setPublishTarget] = useState<MdDocument | null>(null);
  // Back from GitHub after connecting, the dialog the writer left is opened again on its draft.
  useEffect(() => {
    if (!accountLoaded) return;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(PUBLISH_AFTER_CONNECT);
      if (id) sessionStorage.removeItem(PUBLISH_AFTER_CONNECT);
    } catch {
      return;
    }
    if (!id) return;
    void documentStore.get(id).then((d) => {
      if (!d) return;
      go.current({ to: "/editor/$docId", params: { docId: d.id }, replace: true });
      setPublishTarget(d);
    });
  }, [accountLoaded]);
  const shares = useShares();
  const sharedIds = useMemo(() => new Set(shares.byDraft.keys()), [shares.byDraft]);
  const privateIds = useMemo(
    () => new Set([...shares.byDraft].filter(([, s]) => s.access === "people").map(([id]) => id)),
    [shares.byDraft],
  );
  const remove = async (d: MdDocument) => {
    setToDelete(null);
    // an edit still waiting for its autosave must not write the draft back after it is deleted
    if (d.id === docId) pending.current = null;
    await documentStore.remove(d.id);
    historyStore.clear(d.id).catch(console.error);
    const rest = docs.filter((x) => x.id !== d.id);
    // the list must forget it at once: anything that reads it while the page moves on (the
    // example waiting for drafts to arrive) would otherwise send us back to the deleted draft
    setDocs(rest);
    if (d.id === docId) {
      // leave the deleted address for good (replace), so Back cannot return to a missing draft
      go.current({
        to: "/editor/$docId",
        params: { docId: rest[0]?.id ?? NEW_DOC_ID },
        replace: true,
      });
    } else refreshList();
  };

  const renameFolder = async (from: string, name: string) => {
    const target = normalizeFolder(name);
    if (!target) return;
    const lower = (x: string) => x.toLowerCase();
    // another folder with that name (a change of case to this folder's own name is fine)
    const clash = [...folderNames, ...docs.flatMap((x) => x.folder ?? [])].some(
      (f) => lower(f) === lower(target) && lower(f) !== lower(from),
    );
    if (clash) {
      toast.error(`A folder named “${target}” already exists`);
      return;
    }
    await documentStore.renameFolder(from, target);
    // the open draft is held in state and autosaved, so it has to hear about the new name too
    setDoc((d) => (d?.folder?.toLowerCase() === from.toLowerCase() ? { ...d, folder: target } : d));
    refreshList();
  };
  const deleteFolder = async (name: string) => {
    const inside = docs.filter((d) => d.folder === name);
    if (doc && inside.some((d) => d.id === doc.id)) pending.current = null;
    await Promise.all(inside.map((d) => documentStore.remove(d.id)));
    inside.forEach((d) => historyStore.clear(d.id).catch(console.error));
    await documentStore.folders.remove(name);
    if (inside.some((d) => d.id === docId)) {
      const rest = docs.filter((d) => d.folder !== name);
      setDocs(rest);
      go.current({
        to: "/editor/$docId",
        params: { docId: rest[0]?.id ?? NEW_DOC_ID },
        replace: true,
      });
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
  const activePanel = overlay ? mobilePanel : panel;
  const goToLine = (line: number) => {
    setView("editor");
    setMobilePanel(null);
    setTimeout(() => editor.current?.goToLine(line), 100);
  };
  const ownShare = doc ? shares.byDraft.get(doc.id) : undefined;
  const panelButtons = (
    [
      ["checks", errCount ? AlertTriangle : CheckCircle2, "Checks"],
      ["outline", ListTree, "Outline"],
      ["meta", Tags, "Front matter"],
      ["history", History, "History"],
      // comments belong to a draft that is in the cloud; the panel reads them when it is opened
      ...(inCloud ? ([["comments", MessageSquare, "Comments"]] as const) : []),
    ] as const
  ).map(([p, Icon, label]) => (
    <Button
      key={p}
      variant={activePanel === p ? "secondary" : "ghost"}
      size="icon"
      className="relative size-10 shrink-0"
      onClick={() => (overlay ? setMobilePanel(p) : setPanel(panel === p ? null : p))}
      aria-label={label}
      title={label}
    >
      <Icon className="size-4" />
      {p === "checks" && errCount > 0 && (
        <span className="absolute right-0 top-0 rounded-full bg-warning px-1 text-[10px] text-foreground">
          {errCount}
        </span>
      )}
    </Button>
  ));
  const libraryContent = (
    <Library
      docs={libraryDocs}
      folders={folderNames}
      activeId={docId}
      onCreateFolder={createFolder}
      onRenameFolder={renameFolder}
      onDeleteFolder={deleteFolder}
      onNew={() => newDoc()}
      onOpen={() => setMobileLibrary(false)}
      onRename={rename}
      onDuplicate={duplicate}
      onDelete={setToDelete}
      onMove={move}
      {...(account && {
        cloud: {
          ids: cloudDrafts.linked,
          limit: cloudDrafts.limit,
          // Until the email is confirmed, trying the cloud opens the dialog that asks for that.
          onAdd: (d: MdDocument) =>
            cloudOn ? void addToCloud(account.id, [d.id]) : askToConfirmEmail(),
          onRemove: (d: MdDocument) => void removeFromCloud(account.id, d.id),
          ...(cloudOn && {
            onShare: (d: MdDocument) => setShareTarget(d),
            shared: sharedIds,
            sharedPrivately: privateIds,
          }),
          ...(cloudOn && githubPublish && { onPublish: (d: MdDocument) => setPublishTarget(d) }),
          ...(hostingOn && cloudOn && { onHostImages: (d: MdDocument) => void hostImages(d) }),
        },
      })}
    />
  );
  const panelContent = (
    <div className="flex-1 overflow-y-auto p-3">
      {activePanel === "checks" && (
        <ChecksPanel
          issues={issues}
          onGo={(l) => goToLine(l)}
          onFix={fixIssue}
          onOpenRules={() => setRulesOpen(true)}
        />
      )}
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
      {activePanel === "history" && (
        <HistoryPanel
          revisions={revisions}
          content={content}
          onSave={saveVersion}
          onRestore={restoreVersion}
          {...(cloudRevs &&
            doc &&
            account && {
              cloud: {
                ...cloudRevs,
                onOpen: (r: CloudRevision) => fetchCloudRevision(account.id, doc.id, r),
              },
            })}
        />
      )}
      {activePanel === "comments" && doc && (
        <ReviewComments draftId={doc.id} share={ownShare} onGo={goToLine} />
      )}
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
        <SiteNotice />
        {/* Top bar */}
        <header className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 border-b border-border px-2 py-2 sm:px-3">
          <div className="flex min-w-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-10 shrink-0"
              // Where the sidebar is not shown (phones, focus mode) the drafts open as a panel from the left
              onClick={() => (compact || focus ? setMobileLibrary(true) : setLibrary((v) => !v))}
              aria-label="Toggle drafts"
            >
              <PanelLeft className="size-4" />
            </Button>
            <Logo textClassName="text-base sm:text-lg" markClassName="size-6" />
            <VersionTag className="hidden sm:inline-block" />
            <span className="ml-2 hidden min-w-0 truncate text-sm text-muted-foreground xl:block">
              / {doc?.title ?? "…"}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {install && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 sm:px-3"
                aria-label="Install mdstudio"
                onClick={() => install()}
              >
                <MonitorDown className="size-4" /> <span className="hidden xl:inline">Install</span>
              </Button>
            )}
            <AiWriter
              key={docId}
              content={content}
              onCreate={newDoc}
              onApply={(metadata) => {
                setContent(joinFrontMatter({ ...fm.data, ...metadata }, fm.body));
                if (overlay) setMobilePanel("meta");
                else setPanel("meta");
                toast.success("AI suggestions applied to front matter");
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 sm:px-3"
                  aria-label="Import Markdown"
                >
                  <Upload className="size-4" /> <span className="hidden sm:inline">Import</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                  <FileUp className="size-4" />
                  <div className="flex flex-col">
                    <span>Files or a ZIP…</span>
                    <span className="text-xs text-muted-foreground">
                      Markdown, text, or an exported archive
                    </span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => folderInput.current?.click()}>
                  <FolderUp className="size-4" />
                  <div className="flex flex-col">
                    <span>A folder…</span>
                    <span className="text-xs text-muted-foreground">
                      Folders become library folders
                    </span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="default"
                  size="sm"
                  className="h-8 px-2 sm:px-3"
                  aria-label="Export"
                >
                  <Download className="size-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Markdown</DropdownMenuLabel>
                <DropdownMenuItem
                  onClick={() => {
                    warnLocalImages();
                    download(`${fileBase()}.md`, out(), "text/markdown;charset=utf-8");
                  }}
                >
                  <Download className="size-4" /> Download .md
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    warnLocalImages();
                    void copy(out(), "Markdown");
                  }}
                >
                  <Copy className="size-4" /> Copy Markdown
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasLocalImages}
                  onClick={() =>
                    download(`${fileBase()}.md`, out(true), "text/markdown;charset=utf-8")
                  }
                >
                  <ImageIcon className="size-4" />
                  <div className="flex flex-col">
                    <span>Download self-contained .md</span>
                    <span className="text-xs text-muted-foreground">Images embedded as base64</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!hasLocalImages}
                  onClick={() => copy(out(true), "Self-contained Markdown")}
                >
                  <Copy className="size-4" /> Copy self-contained Markdown
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
                  <Copy className="size-4" /> Copy rendered HTML
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
                  <Download className="size-4" /> Download standalone .html
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>All drafts</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => exportAsync(exportAll)}>
                  <Archive className="size-4" />
                  <div className="flex flex-col">
                    <span>Download all drafts (.zip)</span>
                    <span className="text-xs text-muted-foreground">
                      One Markdown file each, folders kept
                    </span>
                  </div>
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
            {cloudOn && doc && cloudDrafts.linked.has(doc.id) && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 sm:px-3"
                aria-label="Share"
                onClick={() => setShareTarget(doc)}
              >
                <Share2 className="size-4" />
                <span className="hidden sm:inline">Share</span>
              </Button>
            )}
            {cloudOn && githubPublish && doc && cloudDrafts.linked.has(doc.id) && (
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2 sm:px-3"
                aria-label="Publish to GitHub"
                onClick={() => setPublishTarget(doc)}
              >
                <Github className="size-4" />
                <span className="hidden xl:inline">Publish</span>
              </Button>
            )}
            <ThemeToggle className="hidden sm:inline-flex" />
            <AccountMenu />
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".md,.markdown,.mdown,.txt,.zip,text/markdown,text/plain,application/zip"
            multiple
            hidden
            onChange={(e) => {
              onFiles([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <input
            ref={folderInput}
            type="file"
            aria-label="Import a folder"
            // not in the DOM typings yet, but every major browser supports picking a directory
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            hidden
            onChange={(e) => {
              onFolder([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
            <Select value={profile} onValueChange={(v) => chooseProfile(v as Profile)}>
              <SelectTrigger
                className="h-10 w-full min-w-0 sm:max-w-50 [&_.text-xs]:hidden"
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
                    className={cn("size-10 shrink-0", v === "split" && "hidden md:inline-flex")}
                    onClick={() => setView(v)}
                    aria-label={`${v} view`}
                    aria-pressed={effectiveView === v}
                    title={`${v} view`}
                  >
                    <Icon className="size-4" />
                  </Button>
                ))}
              </div>
              <div className="hidden md:flex xl:hidden">{panelButtons}</div>
            </div>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Library */}
          {showLibrary && (
            <div className="relative flex shrink-0 flex-col" style={{ width: libraryWidth }}>
              {libraryContent}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize drafts pane"
                aria-valuemin={LIBRARY_WIDTH.min}
                aria-valuemax={LIBRARY_WIDTH.max}
                aria-valuenow={libraryWidth}
                tabIndex={0}
                className="absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none transition-colors hover:bg-ring/40 focus-visible:bg-ring/60 focus-visible:outline-none active:bg-ring/60"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const el = e.currentTarget;
                  el.setPointerCapture(e.pointerId);
                  const left = el.parentElement?.getBoundingClientRect().left ?? 0;
                  const move = (ev: PointerEvent) => resizeLibrary(ev.clientX - left, false);
                  const up = (ev: PointerEvent) => {
                    el.removeEventListener("pointermove", move);
                    el.removeEventListener("pointerup", up);
                    el.removeEventListener("pointercancel", up);
                    resizeLibrary(ev.clientX - left);
                  };
                  el.addEventListener("pointermove", move);
                  el.addEventListener("pointerup", up);
                  el.addEventListener("pointercancel", up);
                }}
                onDoubleClick={() => resizeLibrary(LIBRARY_WIDTH.default)}
                onKeyDown={(e) => {
                  const step = e.shiftKey ? 48 : 16;
                  if (e.key === "ArrowLeft") resizeLibrary(libraryWidth - step);
                  else if (e.key === "ArrowRight") resizeLibrary(libraryWidth + step);
                  else if (e.key === "Home") resizeLibrary(LIBRARY_WIDTH.min);
                  else if (e.key === "End") resizeLibrary(LIBRARY_WIDTH.max);
                  else return;
                  e.preventDefault();
                }}
              />
            </div>
          )}

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
                onAiAction={startAi}
                onAiIntegrations={() => setAiIntegrations(true)}
                focus={focus}
                onToggleFocus={() => setFocus((f) => !f)}
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
                          // a live draft gets its own editor, bound to the shared text
                          key={
                            waiting
                              ? `wait:${doc.id}`
                              : collabReady && collab
                                ? `live:${doc.id}`
                                : "solo"
                          }
                          ref={editor}
                          value={content}
                          {...(collabReady && collab && !waiting ? { collab } : {})}
                          readOnly={waiting}
                          onChange={collabReady && !waiting ? noop : setContent}
                          onScroll={onEditorScroll}
                          onPaste={onPaste}
                          onFiles={onFiles}
                          onContext={setCtx}
                          onLinkShortcut={openLink}
                          onFocusToolbar={() => toolbar.current?.focus()}
                          onShowShortcuts={() => setShortcuts(true)}
                          onCursorLine={setCursorLine}
                          onSelectionRect={setSelRect}
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
                    onClick={onPreviewClick}
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
              {!online && <span>Offline, your drafts are still saved here</span>}
              {liveTarget && <CollabStatus state={collabState} waiting={waiting} />}
              {account && syncStatus.state !== "idle" && (
                <span
                  data-testid="sync-status"
                  className={cn("ml-auto", syncStatus.state === "error" && "text-destructive")}
                >
                  {syncLabel(syncStatus)}
                </span>
              )}
              <span
                role="status"
                className={cn(
                  account && syncStatus.state !== "idle" ? "" : "ml-auto",
                  saveState === "error" && "text-destructive",
                )}
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
          {!compact && (
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
        <nav
          aria-label="Document panels"
          className="flex shrink-0 items-center justify-around border-t border-border pb-[env(safe-area-inset-bottom)] md:hidden"
        >
          {panelButtons}
        </nav>
        <ShareDialog
          draft={shareTarget && doc && shareTarget.id === doc.id ? doc : shareTarget}
          open={shareTarget !== null}
          onOpenChange={(open) => !open && setShareTarget(null)}
          beforePublish={bringCloudUpToDate}
        />
        <PublishDialog
          draft={publishTarget && doc && publishTarget.id === doc.id ? doc : publishTarget}
          open={publishTarget !== null}
          onOpenChange={(open) => !open && setPublishTarget(null)}
          beforePublish={bringCloudUpToDate}
          config={checkConfig}
        />
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
        <RulesDialog
          open={rulesOpen}
          onOpenChange={setRulesOpen}
          config={checkConfig}
          onChange={chooseCheckConfig}
        />
        {selRect && !aiEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                className="fixed z-40 hidden h-7 gap-1 px-2 shadow-md md:inline-flex"
                style={{
                  left: Math.max(8, Math.min(selRect.x, window.innerWidth - 80)),
                  top: selRect.top > 48 ? selRect.top - 36 : selRect.bottom + 6,
                }}
                onMouseDown={(e) => e.preventDefault()}
                aria-label="AI actions on the selection"
              >
                <Sparkles className="size-3.5" /> AI
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <AiMenuItems onPick={startAi} onIntegrations={() => setAiIntegrations(true)} />
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <AiEditDialog edit={aiEdit} onClose={() => setAiEdit(null)} onAccept={acceptAi} />
        <AiIntegrationsDialog open={aiIntegrations} onOpenChange={setAiIntegrations} />
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
        <Sheet open={(compact || focus) && mobileLibrary} onOpenChange={setMobileLibrary}>
          <SheetContent
            side="left"
            className="flex h-dvh w-[min(90vw,360px)] flex-col gap-0 p-0"
            aria-describedby={undefined}
            // in focus mode, closing the list puts the cursor back where the writing is
            onCloseAutoFocus={(e) => {
              if (!focus) return;
              e.preventDefault();
              editor.current?.focus();
            }}
          >
            <SheetTitle className="border-b border-border px-4 py-4">Your drafts</SheetTitle>
            {libraryContent}
          </SheetContent>
        </Sheet>
        <Sheet
          open={overlay && mobilePanel !== null}
          onOpenChange={(open) => {
            if (!open) setMobilePanel(null);
          }}
        >
          <SheetContent
            side="right"
            className="flex h-dvh w-[min(92vw,380px)] flex-col gap-0 p-0"
            aria-describedby={undefined}
            // in focus mode, closing a panel puts the cursor back where the writing is
            onCloseAutoFocus={(e) => {
              if (!focus) return;
              e.preventDefault();
              editor.current?.focus();
            }}
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
  onFix,
  onOpenRules,
}: {
  issues: Issue[];
  onGo: (l: number) => void;
  onFix: (issue: Issue) => void;
  onOpenRules: () => void;
}) {
  const rules = (
    <Button variant="outline" size="sm" className="w-full" onClick={onOpenRules}>
      <SlidersHorizontal className="size-4" /> Rules
    </Button>
  );
  if (!issues.length)
    return (
      <div className="space-y-3">
        {rules}
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="size-8 text-primary" />
          <p className="text-sm font-medium">Portable</p>
          <p className="text-xs text-muted-foreground">
            Nothing here should render differently on your target platform.
          </p>
        </div>
      </div>
    );
  return (
    <div className="space-y-3">
      {rules}
      <ul className="space-y-2">
        {issues.map((i, k) => {
          const Icon =
            i.severity === "error" ? CircleAlert : i.severity === "warning" ? AlertTriangle : Info;
          return (
            <li key={k} className="rounded-md border border-border bg-card">
              <button
                onClick={() => onGo(i.line)}
                className="flex w-full gap-2 rounded-md p-2.5 text-left hover:bg-accent"
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    i.severity === "error"
                      ? "text-destructive"
                      : i.severity === "warning"
                        ? "text-warning"
                        : "text-info",
                  )}
                />
                <span className="text-sm/snug">
                  <span className="mr-1 font-mono text-xs text-muted-foreground">L{i.line}</span>
                  {i.message}
                  {i.group && (
                    <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {i.group === "custom" ? "yours" : "standard"} · {i.rule}
                    </span>
                  )}
                </span>
              </button>
              {canFix(i) && (
                <div className="px-2.5 pb-2.5 pl-9">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => onFix(i)}
                  >
                    <Sparkles className="size-3.5" />
                    {i.rule === "missing-alt" ? "Suggest alt text" : "Fix with AI"}
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
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
  const badCanonical = str("canonical_url") !== "" && !isHttpUrl(str("canonical_url"));
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
        <Label htmlFor="fm-canonical">Canonical URL</Label>
        <Input
          id="fm-canonical"
          type="url"
          placeholder="https://example.com/original-post"
          value={str("canonical_url")}
          aria-invalid={badCanonical}
          aria-describedby="fm-canonical-hint"
          onChange={(e) => set("canonical_url", e.target.value)}
        />
        <p
          id="fm-canonical-hint"
          className={cn("text-xs", badCanonical ? "text-destructive" : "text-muted-foreground")}
        >
          {badCanonical
            ? "Use a full http(s) address."
            : "Where the post was first published, for cross-posting (dev.to reads canonical_url)."}
        </p>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="fm-draft">Draft</Label>
        <Switch
          id="fm-draft"
          checked={data["draft"] === true}
          onCheckedChange={(on) => set("draft", on ? true : undefined)}
        />
      </div>
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
