import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  undo,
} from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { classHighlighter } from "@lezer/highlight";
import {
  getContext,
  isListLine,
  runCommand,
  type Command,
  type Context,
  type Edit,
  type Snapshot,
} from "@/lib/editor/editing";
import { isInTable, tableMove } from "@/lib/editor/tables";

export type EditorHandle = {
  /** Runs a pure editing command (see `lib/editing.ts`) on the current selection. */
  run: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  /** Current text and selection, for commands that need input first (dialogs). */
  getSnapshot: () => Snapshot;
  apply: (edit: Edit) => void;
  insert: (text: string) => void;
  goToLine: (line: number) => void;
  /** Selects a range and scrolls it into view (a comment's words). */
  selectRange: (from: number, to: number) => void;
  /** Puts the cursor at the start of a line (1-based) and scrolls only if it is out of view. */
  placeCursor: (line: number) => void;
  /** Scrolls to a fraction of the document; returns the resulting scroll position. */
  scrollToRatio: (r: number) => number;
  /** Scrolls so that this source line (1-based, may have a fraction) is at the top. */
  scrollToLine: (line: number) => number;
  focus: () => void;
};

/** A live draft's binding (see lib/collab/session.ts): the text then lives in the shared document, not in `value`. */
export type CollabBinding = { extension: Extension; undo: () => void; redo: () => void };

type Props = {
  value: string;
  /** Edited live with other people: the editor shows and changes the shared text, and Undo is only this person's own. */
  collab?: CollabBinding;
  /** Shown but not editable (a live draft whose text has not arrived yet). */
  readOnly?: boolean;
  onChange: (v: string) => void;
  /** The editor scrolled: the line at the top (with a fraction), how far down, and whether it is at the end. */
  onScroll?: (position: { line: number; ratio: number; atEnd: boolean; top: number }) => void;
  onPaste?: (e: ClipboardEvent) => string | null;
  onFiles?: (files: File[]) => void;
  /** Called when the formatting state at the cursor changes (drives toolbar toggle state). */
  onContext?: (context: Context) => void;
  /** Mod-K: the studio opens its link dialog. */
  onLinkShortcut?: () => void;
  /** Alt-F10: move keyboard focus to the toolbar (Tab is used for indenting in the editor). */
  onFocusToolbar?: () => void;
  /** Mod-/: show the shortcuts list. */
  onShowShortcuts?: () => void;
  /** The line (1-based) the cursor is on, whenever it changes (the preview highlights its block). */
  onCursorLine?: (line: number) => void;
  /** Where selected text starts on screen once the writer has finished selecting, or null when nothing is selected. */
  onSelectionRect?: (rect: { x: number; top: number; bottom: number } | null) => void;
};

const snapshot = (state: EditorState): Snapshot => ({
  text: state.doc.toString(),
  from: state.selection.main.from,
  to: state.selection.main.to,
});

const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const silent = useRef(false);
  const lastContext = useRef("");
  const lastLine = useRef(0);

  useEffect(() => {
    const tabInStructure = (v: EditorView, dir: 1 | -1) => {
      const snap = snapshot(v.state);
      if (isInTable(snap)) {
        const edit = tableMove(snap, dir);
        if (edit) api.apply(edit);
        return true; // consumed even at the first cell, so Shift-Tab never inserts spaces in a table
      }
      if (isListLine(snap)) return (api.run(dir === 1 ? "indent" : "outdent"), true);
      return false;
    };
    const cmd = (command: Command) => () => (api.run(command), true);
    const emitSelection = (v: EditorView) => {
      const { from, to } = v.state.selection.main;
      const at = from === to ? null : v.coordsAtPos(from);
      cb.current.onSelectionRect?.(at && { x: at.left, top: at.top, bottom: at.bottom });
    };
    const emitContext = (state: EditorState) => {
      const context = getContext(snapshot(state));
      const key = JSON.stringify(context);
      if (key === lastContext.current) return;
      lastContext.current = key;
      cb.current.onContext?.(context);
    };
    const state = EditorState.create({
      doc: props.value,
      extensions: [
        lineNumbers(),
        highlightActiveLine(),
        highlightActiveLineGutter(),
        drawSelection(),
        // each person undoes only their own edits: a live draft's undo history is the binding's
        ...(props.collab ? [props.collab.extension] : [history()]),
        ...(props.readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
        search({ top: true }),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(classHighlighter),
        keymap.of([
          { key: "Mod-b", run: cmd("bold") },
          { key: "Mod-i", run: cmd("italic") },
          { key: "Mod-e", run: cmd("code") },
          { key: "Mod-Shift-x", run: cmd("strike") },
          { key: "Mod-Shift-h", run: cmd("highlight") },
          { key: "Mod-Shift-7", run: cmd("ordered") },
          { key: "Mod-Shift-8", run: cmd("bullet") },
          { key: "Mod-Shift-l", run: cmd("task") },
          { key: "Mod-Shift-.", run: cmd("quote") },
          ...([0, 1, 2, 3, 4, 5, 6] as const).map((n) => ({
            key: `Mod-Alt-${n}`,
            run: cmd(`h${n}`),
          })),
          { key: "Mod-k", run: () => (cb.current.onLinkShortcut?.(), true) },
          { key: "Alt-F10", run: () => (cb.current.onFocusToolbar?.(), true) },
          { key: "Mod-/", run: () => (cb.current.onShowShortcuts?.(), true) },
          // Tab moves between table cells and nests list items; anywhere else it indents.
          { key: "Tab", run: (v) => tabInStructure(v, 1) },
          { key: "Shift-Tab", run: (v) => tabInStructure(v, -1) },
          ...searchKeymap,
          ...(props.collab ? [] : historyKeymap),
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !silent.current) cb.current.onChange(u.state.doc.toString());
          if ((u.docChanged || u.selectionSet) && u.state.selection.main.empty)
            cb.current.onSelectionRect?.(null);
          if (u.docChanged || u.selectionSet) {
            emitContext(u.state);
            const line = u.state.doc.lineAt(u.state.selection.main.head).number;
            if (line !== lastLine.current) {
              lastLine.current = line;
              cb.current.onCursorLine?.(line);
            }
          }
        }),
        EditorView.domEventHandlers({
          mouseup: (_e, v) => void setTimeout(() => emitSelection(v)),
          keyup: (_e, v) => emitSelection(v),
          scroll: (_e, v) => {
            cb.current.onSelectionRect?.(null);
            const s = v.scrollDOM;
            const max = s.scrollHeight - s.clientHeight;
            const block = v.lineBlockAtHeight(s.scrollTop - v.documentPadding.top);
            const fraction =
              block.height > 0
                ? Math.max(0, (s.scrollTop - v.documentPadding.top - block.top) / block.height)
                : 0;
            cb.current.onScroll?.({
              line: v.state.doc.lineAt(block.from).number + Math.min(fraction, 0.999),
              ratio: max > 0 ? s.scrollTop / max : 0,
              atEnd: max > 0 && s.scrollTop >= max - 1,
              top: s.scrollTop,
            });
          },
          paste: (e, v) => {
            const files = [...(e.clipboardData?.files ?? [])].filter((f) =>
              f.type.startsWith("image/"),
            );
            if (files.length) {
              e.preventDefault();
              cb.current.onFiles?.(files);
              return true;
            }
            const converted = cb.current.onPaste?.(e);
            if (converted != null) {
              e.preventDefault();
              v.dispatch(v.state.replaceSelection(converted));
              return true;
            }
            return false;
          },
          drop: (e) => {
            const files = [...(e.dataTransfer?.files ?? [])];
            if (!files.length) return false;
            e.preventDefault();
            cb.current.onFiles?.(files);
            return true;
          },
        }),
      ],
    });
    view.current = new EditorView({ state, parent: host.current! });
    emitContext(state);
    return () => view.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // External value changes (import, front matter form, switching docs). A live draft's text is the
  // shared document's: changes made from outside go into it directly (Studio), never through here.
  useEffect(() => {
    const v = view.current;
    if (!v || cb.current.collab) return;
    const cur = v.state.doc.toString();
    if (cur !== props.value) {
      silent.current = true;
      v.dispatch({ changes: { from: 0, to: cur.length, insert: props.value } });
      silent.current = false;
    }
  }, [props.value]);

  const api: EditorHandle = {
    run(command) {
      const v = view.current!;
      if (v.state.readOnly) return;
      const edit = runCommand(snapshot(v.state), command);
      if (edit)
        v.dispatch({ changes: edit.changes, selection: { anchor: edit.from, head: edit.to } });
      v.focus();
    },
    undo() {
      const v = view.current!;
      if (cb.current.collab) cb.current.collab.undo();
      else undo(v);
      v.focus();
    },
    redo() {
      const v = view.current!;
      if (cb.current.collab) cb.current.collab.redo();
      else redo(v);
      v.focus();
    },
    getSnapshot: () => snapshot(view.current!.state),
    apply(edit) {
      const v = view.current!;
      if (v.state.readOnly) return;
      v.dispatch({ changes: edit.changes, selection: { anchor: edit.from, head: edit.to } });
      v.focus();
    },
    insert(text) {
      const v = view.current!;
      if (v.state.readOnly) return;
      v.dispatch(v.state.replaceSelection(text));
      v.focus();
    },
    goToLine(line) {
      const v = view.current!;
      const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
      v.dispatch({
        selection: { anchor: l.from },
        effects: EditorView.scrollIntoView(l.from, { y: "start", yMargin: 40 }),
      });
      v.focus();
    },
    selectRange(from, to) {
      const v = view.current!;
      const end = v.state.doc.length;
      v.dispatch({
        selection: { anchor: Math.min(from, end), head: Math.min(to, end) },
        effects: EditorView.scrollIntoView(Math.min(from, end), { y: "center" }),
      });
      v.focus();
    },
    placeCursor(line) {
      const v = view.current!;
      const l = v.state.doc.line(Math.min(Math.max(1, line), v.state.doc.lines));
      v.dispatch({
        selection: { anchor: l.from },
        effects: EditorView.scrollIntoView(l.from, { y: "nearest", yMargin: 48 }),
      });
      v.focus();
    },
    scrollToLine(line) {
      const v = view.current!;
      const n = Math.min(Math.max(1, Math.floor(line)), v.state.doc.lines);
      const block = v.lineBlockAt(v.state.doc.line(n).from);
      const target = block.top + (line - n) * block.height + v.documentPadding.top;
      v.scrollDOM.scrollTop = target;
      return v.scrollDOM.scrollTop;
    },
    scrollToRatio(r) {
      const s = view.current?.scrollDOM;
      if (!s) return 0;
      s.scrollTop = r * (s.scrollHeight - s.clientHeight);
      return s.scrollTop;
    },
    focus: () => view.current?.focus(),
  };
  useImperativeHandle(ref, () => api);

  return <div ref={host} className="h-full overflow-hidden [&_.cm-editor]:h-full" />;
});

export default MarkdownEditor;
