import {
  forwardRef,
  Fragment,
  useImperativeHandle,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ArrowLeftRight,
  Asterisk,
  Bold,
  Boxes,
  ChartGantt,
  ChartPie,
  ChevronsDownUp,
  Check,
  Code,
  CodeXml,
  Database,
  Heading,
  Highlighter,
  Image as ImageIcon,
  IndentDecrease,
  IndentIncrease,
  Info,
  Italic,
  Keyboard,
  Lightbulb,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Megaphone,
  MessageSquareWarning,
  Minus,
  Network,
  OctagonAlert,
  Plus,
  Quote,
  Sparkles,
  Maximize2,
  Minimize2,
  Redo2,
  Sigma,
  SquareCode,
  SquareFunction,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TriangleAlert,
  Undo2,
  Workflow,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AiActionId } from "@/lib/ai/actions";
import { AiMenuItems } from "./AiMenuItems";
import type { Command, Context, Edit, Snapshot } from "@/lib/editor/editing";
import {
  ALERT_KINDS,
  CODE_LANGUAGES,
  MERMAID_TEMPLATES,
  codeBlock,
  insertAlert,
  insertDetails,
  insertFootnote,
  insertMathBlock,
  insertMermaid,
  insertRule,
  wrapTag,
} from "@/lib/editor/editing-insert";
import { supportHint, type Feature, type Profile } from "@/lib/markdown/markdown";
import { tableCommand, type TableCommand } from "@/lib/editor/tables";
import type { EditorHandle } from "./MarkdownEditor";
import { useRovingToolbar } from "./useRovingToolbar";

export type ToolbarHandle = { focus: () => void };

type Props = {
  editor: RefObject<EditorHandle | null>;
  ctx: Context;
  profile: Profile;
  onOpenLink: () => void;
  onOpenImage: () => void;
  onOpenTable: () => void;
  onOpenShortcuts: () => void;
  /** An AI action on the selected text, and the AI connection settings. */
  onAiAction: (id: AiActionId) => void;
  onAiIntegrations: () => void;
  /** Focus mode hides the side panels; the toggle sits right after undo and redo. */
  focus: boolean;
  onToggleFocus: () => void;
};

type Tool = {
  icon: typeof Bold;
  label: string;
  run: () => void;
  active?: boolean;
  feature?: Feature;
};

const TABLE_OPS: ([TableCommand, string] | "-")[] = [
  ["row-above", "Add row above"],
  ["row-below", "Add row below"],
  ["delete-row", "Delete row"],
  "-",
  ["col-left", "Add column left"],
  ["col-right", "Add column right"],
  ["delete-col", "Delete column"],
  "-",
  ["align-left", "Align column left"],
  ["align-center", "Align column center"],
  ["align-right", "Align column right"],
  ["align-none", "Clear column alignment"],
  "-",
  ["format", "Format table"],
];

const ALERT_ICONS: Record<(typeof ALERT_KINDS)[number], typeof Info> = {
  NOTE: Info,
  TIP: Lightbulb,
  IMPORTANT: Megaphone,
  WARNING: TriangleAlert,
  CAUTION: OctagonAlert,
};

const DIAGRAM_ICONS: Record<string, typeof Info> = {
  flowchart: Workflow,
  sequence: ArrowLeftRight,
  class: Boxes,
  state: Network,
  er: Database,
  gantt: ChartGantt,
  pie: ChartPie,
};

const HTML_EXTRAS: { tag: string; label: string; icon: typeof Info }[] = [
  { tag: "kbd", label: "Keyboard key", icon: Keyboard },
  { tag: "sub", label: "Subscript", icon: Subscript },
  { tag: "sup", label: "Superscript", icon: Superscript },
];

/** Warning mark for a tool the selected platform won't render. The hint is spoken by screen readers. */
function Flag({ hint }: { hint: string | null }) {
  if (!hint) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center pl-2">
      <TriangleAlert aria-hidden className="size-3.5 text-warning" />
      <span className="sr-only">. {hint}</span>
    </span>
  );
}

/** Shows the hint at once (no hover delay) beside a menu row, and on keyboard focus too. */
function WithHint({ hint, children }: { hint: string | null; children: ReactNode }) {
  if (!hint) return <>{children}</>;
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right" className="max-w-56">
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}

/** Icon button that opens a menu; focus goes back to the editor when the menu closes. */
function ToolMenu({
  icon: Icon,
  label,
  active,
  hint,
  editor,
  children,
}: {
  icon: typeof Bold;
  label: string;
  active?: boolean;
  hint: string | null;
  editor: RefObject<EditorHandle | null>;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant={active ? "secondary" : "ghost"}
              size="icon"
              className="relative size-10 md:size-9 shrink-0"
              onMouseDown={(e) => e.preventDefault()}
              aria-label={hint ? `${label}. ${hint}` : label}
              aria-pressed={active}
            >
              <Icon className="size-4" />
              {hint && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warning"
                />
              )}
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          {label}
          {hint && <div className="text-warning">{hint}</div>}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        className="max-h-80 overflow-y-auto"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.current?.focus();
        }}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const EditorToolbar = forwardRef<ToolbarHandle, Props>(function EditorToolbar(
  {
    editor,
    ctx,
    profile,
    onOpenLink,
    onOpenImage,
    onOpenTable,
    onOpenShortcuts,
    onAiAction,
    onAiIntegrations,
    focus,
    onToggleFocus,
  },
  ref,
) {
  const bar = useRef<HTMLDivElement>(null);
  const roving = useRovingToolbar(bar);
  useImperativeHandle(ref, () => ({
    focus: () =>
      bar.current?.querySelector<HTMLElement>("button:not(:disabled)[tabindex='0']")?.focus(),
  }));

  const hintFor = (feature?: Feature) => (feature ? supportHint(feature, profile) : null);
  const run = (command: Command) => () => editor.current?.run(command);
  /** Applies a pure insertion command to the current selection. */
  const insert = (fn: (snap: Snapshot) => Edit | null) => () => {
    const e = editor.current;
    if (!e) return;
    const edit = fn(e.getSnapshot());
    if (edit) e.apply(edit);
    else e.focus();
  };

  const groups: Tool[][] = [
    [
      { icon: Undo2, label: "Undo (Ctrl/⌘+Z)", run: () => editor.current?.undo() },
      { icon: Redo2, label: "Redo (Ctrl/⌘+Shift+Z)", run: () => editor.current?.redo() },
      {
        icon: focus ? Minimize2 : Maximize2,
        label: "Focus mode",
        run: onToggleFocus,
        active: focus,
      },
    ],
    [
      { icon: Bold, label: "Bold (Ctrl/⌘+B)", run: run("bold"), active: ctx.bold },
      { icon: Italic, label: "Italic (Ctrl/⌘+I)", run: run("italic"), active: ctx.italic },
      {
        icon: Strikethrough,
        label: "Strikethrough (Ctrl/⌘+Shift+X)",
        run: run("strike"),
        active: ctx.strike,
        feature: "strike",
      },
      { icon: Code, label: "Inline code (Ctrl/⌘+E)", run: run("code"), active: ctx.code },
    ],
    [
      { icon: Link2, label: "Link (Ctrl/⌘+K)", run: onOpenLink },
      { icon: ImageIcon, label: "Image", run: onOpenImage },
    ],
    [
      { icon: Quote, label: "Quote (Ctrl/⌘+Shift+.)", run: run("quote"), active: ctx.quote },
      {
        icon: List,
        label: "Bulleted list (Ctrl/⌘+Shift+8)",
        run: run("bullet"),
        active: ctx.list === "bullet",
      },
      {
        icon: ListOrdered,
        label: "Numbered list (Ctrl/⌘+Shift+7)",
        run: run("ordered"),
        active: ctx.list === "ordered",
      },
      {
        icon: ListChecks,
        label: "Task list (Ctrl/⌘+Shift+L)",
        run: run("task"),
        active: ctx.list === "task",
        feature: "task",
      },
    ],
  ];

  const headingMenu = (
    <ToolMenu
      icon={Heading}
      label="Heading style (Ctrl/⌘+Alt+1–6)"
      active={ctx.heading > 0}
      hint={null}
      editor={editor}
    >
      {([0, 1, 2, 3, 4, 5, 6] as const).map((n) => (
        <DropdownMenuItem key={n} onClick={run(`h${n}`)}>
          <span className="flex w-4 justify-center">
            {ctx.heading === n && <Check className="size-4" />}
          </span>
          {n === 0 ? "Paragraph" : `Heading ${n}`}
        </DropdownMenuItem>
      ))}
    </ToolMenu>
  );

  const codeMenu = (
    <ToolMenu
      icon={SquareCode}
      label="Code block"
      active={ctx.codeLang !== null}
      hint={null}
      editor={editor}
    >
      {ctx.codeLang !== null && (
        <>
          <DropdownMenuItem onClick={insert((snap) => codeBlock(snap, ctx.codeLang ?? ""))}>
            Remove code block
          </DropdownMenuItem>
          <DropdownMenuSeparator />
        </>
      )}
      {[{ id: "", label: "No language" }, ...CODE_LANGUAGES].map((l) => (
        <DropdownMenuItem key={l.id} onClick={insert((snap) => codeBlock(snap, l.id))}>
          <span className="flex w-4 justify-center">
            {ctx.codeLang === l.id && <Check className="size-4" />}
          </span>
          {l.label}
        </DropdownMenuItem>
      ))}
    </ToolMenu>
  );

  const tableMenu = (
    <ToolMenu icon={Table} label="Table" active={ctx.table} hint={hintFor("table")} editor={editor}>
      <DropdownMenuItem onClick={onOpenTable}>Insert table</DropdownMenuItem>
      <DropdownMenuSeparator />
      {TABLE_OPS.map((op, i) =>
        op === "-" ? (
          <DropdownMenuSeparator key={i} />
        ) : (
          <DropdownMenuItem
            key={op[0]}
            disabled={!ctx.table}
            onClick={insert((snap) => tableCommand(snap, op[0]))}
          >
            {op[1]}
          </DropdownMenuItem>
        ),
      )}
    </ToolMenu>
  );

  /** A menu entry with an icon; flagged features get an instant tooltip and a warning mark. */
  const item = (
    label: string,
    Icon: typeof Info,
    onClick: () => void,
    feature?: Feature,
    checked = false,
  ) => {
    const hint = hintFor(feature);
    return (
      <WithHint key={label} hint={hint}>
        <DropdownMenuItem onClick={onClick}>
          <Icon className="mr-2 size-4 shrink-0" />
          <span className="flex-1">{label}</span>
          {checked && <Check className="ml-2 size-4 shrink-0" />}
          <Flag hint={hint} />
        </DropdownMenuItem>
      </WithHint>
    );
  };
  // The label and warning share one flexible cell, so the warning sits right next to the arrow.
  const submenu = (label: string, Icon: typeof Info, feature: Feature, children: ReactNode) => {
    const hint = hintFor(feature);
    return (
      <DropdownMenuSub>
        <WithHint hint={hint}>
          <DropdownMenuSubTrigger>
            <Icon className="mr-2 size-4 shrink-0" />
            <span className="flex flex-1 items-center">
              {label}
              <Flag hint={hint} />
            </span>
          </DropdownMenuSubTrigger>
        </WithHint>
        <DropdownMenuSubContent>{children}</DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  };

  const insertMenu = (
    <ToolMenu icon={Plus} label="Insert" active={ctx.alert !== null} hint={null} editor={editor}>
      <DropdownMenuLabel>Lists</DropdownMenuLabel>
      <DropdownMenuItem onClick={run("outdent")}>
        <IndentDecrease className="mr-2 size-4" /> Outdent (Shift+Tab)
      </DropdownMenuItem>
      <DropdownMenuItem onClick={run("indent")}>
        <IndentIncrease className="mr-2 size-4" /> Indent (Tab)
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Insert</DropdownMenuLabel>
      {item("Footnote", Asterisk, insert(insertFootnote), "footnote")}
      {item("Horizontal rule", Minus, insert(insertRule))}
      {item("Highlight (==text==)", Highlighter, run("highlight"), "highlight", ctx.highlight)}
      {item("Inline math ($x$)", Sigma, run("math"), "math")}
      {item("Math block ($$)", SquareFunction, insert(insertMathBlock), "math")}
      {submenu(
        "Alert",
        MessageSquareWarning,
        "alert",
        ALERT_KINDS.map((kind) =>
          item(
            kind[0] + kind.slice(1).toLowerCase(),
            ALERT_ICONS[kind],
            insert((snap) => insertAlert(snap, kind)),
            "alert",
            ctx.alert === kind,
          ),
        ),
      )}
      {submenu(
        "Diagram (Mermaid)",
        Workflow,
        "mermaid",
        MERMAID_TEMPLATES.map((t) =>
          item(
            t.label,
            DIAGRAM_ICONS[t.id] ?? Workflow,
            insert((snap) => insertMermaid(snap, t.id)),
            "mermaid",
          ),
        ),
      )}
      {submenu("HTML", CodeXml, "html", [
        item("Collapsible section", ChevronsDownUp, insert(insertDetails), "html"),
        ...HTML_EXTRAS.map((h) =>
          item(
            h.label,
            h.icon,
            insert((snap) => wrapTag(snap, h.tag)),
            "html",
          ),
        ),
      ])}
      <DropdownMenuSeparator />
      <DropdownMenuItem onClick={onOpenShortcuts}>
        <Keyboard className="mr-2 size-4" /> Keyboard shortcuts
      </DropdownMenuItem>
    </ToolMenu>
  );

  const aiMenu = (
    <ToolMenu icon={Sparkles} label="AI actions" hint={null} editor={editor}>
      <AiMenuItems onPick={onAiAction} onIntegrations={onAiIntegrations} />
    </ToolMenu>
  );

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Formatting"
      aria-orientation="horizontal"
      onKeyDown={(e) => {
        roving(e);
        // Escape hands the keyboard back to the document
        if (e.key === "Escape" && bar.current?.contains(e.target as Node)) editor.current?.focus();
      }}
      className="flex shrink-0 flex-wrap items-center gap-x-0.5 gap-y-1 border-b border-border px-2 py-1"
    >
      {groups.map((group, gi) => (
        <Fragment key={gi}>
          {gi > 0 && <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />}
          {gi === 1 && headingMenu}
          {group.map((t) => {
            const hint = hintFor(t.feature);
            return (
              <Tooltip key={t.label}>
                <TooltipTrigger asChild>
                  <Button
                    variant={t.active ? "secondary" : "ghost"}
                    size="icon"
                    className="relative size-10 md:size-9 shrink-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={t.run}
                    aria-label={hint ? `${t.label}. ${hint}` : t.label}
                    aria-pressed={t.active}
                  >
                    <t.icon className="size-4" />
                    {hint && (
                      <span
                        aria-hidden
                        className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-warning"
                      />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {t.label}
                  {hint && <div className="text-warning">{hint}</div>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </Fragment>
      ))}
      <span aria-hidden className="mx-1 h-6 w-px shrink-0 bg-border" />
      {codeMenu}
      {tableMenu}
      {insertMenu}
      {aiMenu}
      <span className="hidden min-w-0 flex-1 truncate pl-2 pr-2 text-right text-xs text-muted-foreground md:block">
        Paste formatted text or drop .md / images · Alt+F10 for toolbar
      </span>
    </div>
  );
});
