import { useDeferredValue, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  CloudOff,
  CopyPlus,
  FilePlus,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Globe,
  ImageUp,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  X,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { MdDocument } from "@/lib/storage/documentStore";
import {
  allTags,
  filterDocs,
  groupByFolder,
  normalizeFolder,
  resolveFolder,
} from "@/lib/storage/library";
import { cn } from "@/lib/utils";

const DRAG_TYPE = "application/x-mdstudio-draft";

/** A text field that lists the existing folders under it while focused; clicking one fills it in. */
function FolderCombobox({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const [open, setOpen] = useState(true);
  const [active, setActive] = useState(-1);
  // a prefilled name (the draft's current folder) shouldn't hide the others until it is edited
  const [edited, setEdited] = useState(false);
  const typed = value.trim().toLowerCase();
  const shown = edited ? options.filter((o) => o.toLowerCase().includes(typed)) : options;
  const visible = open && shown.length > 0;
  const choose = (o: string) => {
    onChange(o);
    setOpen(false);
    setActive(-1);
    setEdited(false);
  };
  return (
    <div>
      <Input
        autoFocus
        role="combobox"
        aria-label="Folder name"
        aria-expanded={visible}
        aria-controls="library-folder-options"
        aria-autocomplete="list"
        aria-activedescendant={visible && active >= 0 ? `library-folder-${active}` : undefined}
        autoComplete="off"
        maxLength={40}
        placeholder="Folder name"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
          setEdited(true);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!shown.length) return;
            e.preventDefault();
            setOpen(true);
            const step = e.key === "ArrowDown" ? 1 : -1;
            setActive((i) => (i + step + shown.length) % shown.length);
          } else if (e.key === "Enter" && visible && active >= 0) {
            e.preventDefault();
            choose(shown[active]!);
          } else if (e.key === "Escape" && visible) {
            setOpen(false);
          }
        }}
      />
      {visible && (
        <ul
          id="library-folder-options"
          role="listbox"
          aria-label="Existing folders"
          className="mt-1 max-h-40 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground"
        >
          {shown.map((o, i) => (
            <li
              key={o}
              id={`library-folder-${i}`}
              role="option"
              aria-selected={i === active}
              // mousedown, not click, so the input keeps focus and doesn't close the list first
              onMouseDown={(e) => {
                e.preventDefault();
                choose(o);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent",
              )}
            >
              <Folder className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{o}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Library({
  docs,
  folders: storedFolders,
  activeId,
  onNew,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
  onMove,
  cloud,
}: {
  /** Every draft, with the open one as it is on screen right now. */
  docs: MdDocument[];
  /** Folder names kept in the library, including empty ones. */
  folders: string[];
  activeId: string;
  onNew: () => void;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (from: string, to: string) => void;
  /** Removes the folder and every draft in it. */
  onDeleteFolder: (name: string) => void;
  /** A draft was chosen (lets the mobile sheet close). */
  onOpen: () => void;
  onRename: (d: MdDocument, name: string) => void;
  onDuplicate: (d: MdDocument) => void;
  onDelete: (d: MdDocument) => void;
  onMove: (d: MdDocument, folder: string | undefined) => void;
  /** Present while signed in: which drafts are stored in the account, and the account's limit. */
  cloud?: {
    ids: ReadonlySet<string>;
    limit: number;
    onAdd: (d: MdDocument) => void;
    onRemove: (d: MdDocument) => void;
    /** Opens the share dialog for a cloud draft; `shared` holds the ids that have a live link. */
    onShare?: (d: MdDocument) => void;
    shared?: ReadonlySet<string>;
    /** Present when this server hosts images: moves a draft's local images to hosting. */
    onHostImages?: (d: MdDocument) => void;
  };
}) {
  const [query, setQuery] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const keepFocus = useRef(false);
  const [moving, setMoving] = useState<MdDocument | null>(null);
  const [folderValue, setFolderValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [newFolder, setNewFolder] = useState("");
  const [dragging, setDragging] = useState<string | null>(null);
  /** Where a dragged draft would land: a folder name, "" for the unfiled area, null for nowhere. */
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null);
  const [folderRename, setFolderRename] = useState("");
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);

  const deferredQuery = useDeferredValue(query);
  const known = useMemo(() => allTags(docs), [docs]);
  const results = useMemo(() => filterDocs(docs, deferredQuery, tags), [docs, deferredQuery, tags]);
  const filtering = deferredQuery.trim() !== "" || tags.length > 0;
  const snippets = new Map(results.map((r) => [r.doc.id, r.snippet]));
  const allGroups = useMemo(
    () =>
      groupByFolder(
        results.map((r) => r.doc),
        storedFolders,
      ),
    [results, storedFolders],
  );
  // while filtering, only places that hold a match are worth showing
  const groups = filtering ? allGroups.filter((g) => g.docs.length > 0) : allGroups;
  const folders = allGroups.flatMap((g) => (g.folder ? [g.folder] : []));
  const filed = (name: string) => docs.filter((d) => d.folder === name);

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const toggleFolder = (f: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (!next.delete(f)) next.add(f);
      return next;
    });

  const dropOn = (e: React.DragEvent, folder: string | undefined) => {
    if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
    e.preventDefault();
    e.stopPropagation();
    const dropped = docs.find((d) => d.id === e.dataTransfer.getData(DRAG_TYPE));
    setDragging(null);
    setDropTarget(null);
    if (dropped) onMove(dropped, folder);
  };

  const row = (d: MdDocument) => (
    <div
      key={d.id}
      draggable={renaming !== d.id}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, d.id);
        e.dataTransfer.effectAllowed = "move";
        setDragging(d.id);
      }}
      onDragEnd={() => {
        setDragging(null);
        setDropTarget(null);
      }}
      className={cn(
        "group flex items-center rounded-md",
        d.id === activeId ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60",
        dragging === d.id && "opacity-50",
      )}
    >
      {renaming === d.id ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            setRenaming(null);
            onRename(d, renameValue);
          }}
        >
          <Input
            autoFocus
            aria-label="Draft name"
            className="h-8 min-w-0 flex-1"
            value={renameValue}
            placeholder={d.title}
            onChange={(e) => setRenameValue(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Save name"
          >
            <Check className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Cancel rename"
            onClick={() => setRenaming(null)}
          >
            <X className="size-4" />
          </Button>
        </form>
      ) : (
        <>
          <Link
            to="/editor/$docId"
            params={{ docId: d.id }}
            onClick={onOpen}
            draggable={false}
            className="min-w-0 flex-1 px-2 py-2"
          >
            <div className="flex items-center gap-1 text-sm font-medium">
              <span className="truncate">{d.title}</span>
              {cloud?.ids.has(d.id) && (
                <Cloud
                  className="size-3 shrink-0 text-muted-foreground"
                  aria-label="Stored in your cloud"
                />
              )}
              {cloud?.shared?.has(d.id) && (
                <Globe className="size-3 shrink-0 text-primary" aria-label="Shared publicly" />
              )}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {snippets.get(d.id) || new Date(d.updatedAt).toLocaleDateString()}
            </div>
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mr-1 h-10 w-10 shrink-0 xl:opacity-0 xl:focus-visible:opacity-100 xl:group-hover:opacity-100 data-[state=open]:opacity-100"
                aria-label={`Options for ${d.title}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(e) => {
                // let the input or dialog that was just opened keep the focus it took
                if (keepFocus.current) e.preventDefault();
                keepFocus.current = false;
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  keepFocus.current = true;
                  setRenameValue(d.name ?? "");
                  setRenaming(d.id);
                }}
              >
                <Pencil className="size-3.5" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  keepFocus.current = true;
                  setFolderValue(d.folder ?? "");
                  setMoving(d);
                }}
              >
                <FolderInput className="size-3.5" /> Move to folder…
              </DropdownMenuItem>
              {cloud &&
                (cloud.ids.has(d.id) ? (
                  <DropdownMenuItem onSelect={() => cloud.onRemove(d)}>
                    <CloudOff className="size-3.5" /> Remove from cloud
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={cloud.ids.size >= cloud.limit}
                    onSelect={() => cloud.onAdd(d)}
                  >
                    <Cloud className="size-3.5" />{" "}
                    {cloud.ids.size >= cloud.limit ? "Cloud is full" : "Save to cloud"}
                  </DropdownMenuItem>
                ))}
              {cloud?.onShare && cloud.ids.has(d.id) && (
                <DropdownMenuItem onSelect={() => cloud.onShare?.(d)}>
                  <Share2 className="size-3.5" /> Share…
                </DropdownMenuItem>
              )}
              {cloud?.onHostImages && cloud.ids.has(d.id) && Object.keys(d.images).length > 0 && (
                <DropdownMenuItem onSelect={() => cloud.onHostImages?.(d)}>
                  <ImageUp className="size-3.5" /> Host images ({Object.keys(d.images).length})
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => onDuplicate(d)}>
                <CopyPlus className="size-3.5" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => onDelete(d)}
              >
                <Trash2 className="size-3.5" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );

  return (
    <aside className="flex min-h-0 flex-1 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center justify-between px-3 py-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Drafts
        </span>
        <div className="flex">
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={() => {
              setNewFolder("");
              setCreating(true);
            }}
            aria-label="New folder"
          >
            <FolderPlus className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-10"
            onClick={onNew}
            aria-label="New draft"
          >
            <FilePlus className="size-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-2 px-3 pb-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            aria-label="Search drafts"
            placeholder="Search drafts"
            className="h-9 pl-8"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {cloud && (
          <p className="text-xs text-muted-foreground" data-testid="cloud-usage">
            Cloud: {cloud.ids.size} of {cloud.limit} drafts
          </p>
        )}
        {known.length > 0 && (
          <div className="flex max-h-20 flex-wrap gap-1 overflow-y-auto" aria-label="Filter by tag">
            {known.map(({ tag }) => (
              <button
                key={tag}
                type="button"
                aria-pressed={tags.includes(tag)}
                onClick={() => toggleTag(tag)}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
                  tags.includes(tag)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-sidebar-accent",
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>
      <nav
        className={cn(
          "flex-1 overflow-y-auto px-2 pb-3 pt-1.5 transition-colors",
          dropTarget === "" && "bg-sidebar-accent/50",
        )}
        aria-label="Drafts"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
          e.preventDefault();
          setDropTarget("");
        }}
        onDrop={(e) => dropOn(e, undefined)}
      >
        {creating && (
          <form
            className="mb-1 flex items-center gap-1 p-1"
            onSubmit={(e) => {
              e.preventDefault();
              const name = normalizeFolder(newFolder);
              setCreating(false);
              if (name) onCreateFolder(name);
            }}
          >
            <Input
              autoFocus
              aria-label="New folder name"
              className="h-8 min-w-0 flex-1"
              maxLength={40}
              placeholder="Folder name"
              value={newFolder}
              onChange={(e) => setNewFolder(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setCreating(false)}
            />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Create folder"
            >
              <Check className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Cancel new folder"
              onClick={() => setCreating(false)}
            >
              <X className="size-4" />
            </Button>
          </form>
        )}
        {groups.map(({ folder, docs: list }) => {
          if (folder === null) return <div key="">{list.map(row)}</div>;
          const open = filtering || !collapsed.has(folder);
          return (
            <div
              key={folder}
              role="group"
              aria-label={`Folder ${folder}`}
              className={cn(
                "mb-1 rounded-md transition-colors",
                dropTarget === folder && "bg-sidebar-accent ring-1 ring-ring",
              )}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                e.preventDefault();
                e.stopPropagation();
                setDropTarget(folder);
              }}
              onDrop={(e) => dropOn(e, folder)}
            >
              <div
                className={cn(
                  "group/folder flex items-center rounded",
                  !filtering && "cursor-pointer hover:bg-sidebar-accent/60",
                )}
              >
                {renamingFolder === folder ? (
                  <form
                    className="flex min-w-0 flex-1 items-center gap-1 p-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setRenamingFolder(null);
                      const name = normalizeFolder(folderRename);
                      if (name && name !== folder) onRenameFolder(folder, name);
                    }}
                  >
                    <Input
                      autoFocus
                      aria-label="Folder name"
                      className="h-8 min-w-0 flex-1"
                      maxLength={40}
                      value={folderRename}
                      onChange={(e) => setFolderRename(e.target.value)}
                      onFocus={(e) => e.currentTarget.select()}
                      onKeyDown={(e) => e.key === "Escape" && setRenamingFolder(null)}
                    />
                    <Button
                      type="submit"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label="Save folder name"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label="Cancel folder rename"
                      onClick={() => setRenamingFolder(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </form>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={filtering}
                      aria-expanded={open}
                      onClick={() => toggleFolder(folder)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 rounded px-2 py-1.5 text-left text-sm font-medium disabled:cursor-default"
                    >
                      {open ? (
                        <ChevronDown className="size-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0" />
                      )}
                      {open ? (
                        <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <Folder className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">{folder}</span>
                    </button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="mr-1 h-8 w-8 shrink-0 xl:opacity-0 xl:focus-visible:opacity-100 xl:group-hover/folder:opacity-100 data-[state=open]:opacity-100"
                          aria-label={`Options for folder ${folder}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onCloseAutoFocus={(e) => {
                          // let the rename field that was just opened keep the focus it took
                          if (keepFocus.current) e.preventDefault();
                          keepFocus.current = false;
                        }}
                      >
                        <DropdownMenuItem
                          onSelect={() => {
                            keepFocus.current = true;
                            setFolderRename(folder);
                            setRenamingFolder(folder);
                          }}
                        >
                          <Pencil className="size-3.5" /> Rename folder
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            const n = filed(folder).length;
                            if (n === 0) onDeleteFolder(folder);
                            else setFolderToDelete(folder);
                          }}
                        >
                          <Trash2 className="size-3.5" /> Delete folder
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </>
                )}
              </div>
              {open && (
                <div className="ml-4 border-l border-sidebar-border pl-1.5">
                  {list.length ? (
                    list.map(row)
                  ) : (
                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                      Empty. Drag drafts here.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {filtering && results.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            No drafts match.{" "}
            <button
              className="underline underline-offset-2"
              onClick={() => {
                setQuery("");
                setTags([]);
              }}
            >
              Clear filters
            </button>
          </p>
        )}
      </nav>
      <p className="border-t border-sidebar-border px-3 py-2 text-xs text-muted-foreground">
        Saved in this browser
      </p>

      <Dialog open={folderToDelete !== null} onOpenChange={(o) => !o && setFolderToDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete folder “{folderToDelete}”?</DialogTitle>
            <DialogDescription>
              {folderToDelete && filed(folderToDelete).length} draft
              {folderToDelete && filed(folderToDelete).length === 1 ? "" : "s"} inside will be
              deleted too, with their saved versions. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderToDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (folderToDelete) onDeleteFolder(folderToDelete);
                setFolderToDelete(null);
              }}
            >
              Delete folder and drafts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moving !== null} onOpenChange={(o) => !o && setMoving(null)}>
        <DialogContent
          onEscapeKeyDown={(e) => {
            // Escape closes the open folder list first, and the dialog on the next press
            if (document.getElementById("library-folder-options")) e.preventDefault();
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (moving) onMove(moving, resolveFolder(folderValue, folders));
              setMoving(null);
            }}
            className="space-y-4"
          >
            <DialogHeader>
              <DialogTitle>Move to folder</DialogTitle>
              <DialogDescription>
                Folders only organise this list; the draft's text is not changed. Leave it empty to
                take the draft out of its folder.
              </DialogDescription>
            </DialogHeader>
            <FolderCombobox value={folderValue} onChange={setFolderValue} options={folders} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMoving(null)}>
                Cancel
              </Button>
              <Button type="submit">Move</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
