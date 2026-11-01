import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState } from "@codemirror/state";
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
} from "@/lib/editing";

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
  scrollToRatio: (r: number) => void;
  focus: () => void;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  onScrollRatio?: (r: number) => void;
  onPaste?: (e: ClipboardEvent) => string | null;
  onFiles?: (files: File[]) => void;
  /** Called when the formatting state at the cursor changes (drives toolbar toggle state). */
  onContext?: (context: Context) => void;
  /** Mod-K: the studio opens its link dialog. */
  onLinkShortcut?: () => void;
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

  useEffect(() => {
    const cmd = (command: Command) => () => (api.run(command), true);
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
        history(),
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
          // Tab nests list items; anywhere else it falls through to a plain indent.
          {
            key: "Tab",
            run: (v) => isListLine(snapshot(v.state)) && (api.run("indent"), true),
          },
          {
            key: "Shift-Tab",
            run: (v) => isListLine(snapshot(v.state)) && (api.run("outdent"), true),
          },
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !silent.current) cb.current.onChange(u.state.doc.toString());
          if (u.docChanged || u.selectionSet) emitContext(u.state);
        }),
        EditorView.domEventHandlers({
          scroll: (_e, v) => {
            const s = v.scrollDOM;
            const max = s.scrollHeight - s.clientHeight;
            cb.current.onScrollRatio?.(max > 0 ? s.scrollTop / max : 0);
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

  // External value changes (import, front matter form, switching docs)
  useEffect(() => {
    const v = view.current;
    if (!v) return;
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
      const edit = runCommand(snapshot(v.state), command);
      if (edit)
        v.dispatch({ changes: edit.changes, selection: { anchor: edit.from, head: edit.to } });
      v.focus();
    },
    undo() {
      const v = view.current!;
      undo(v);
      v.focus();
    },
    redo() {
      const v = view.current!;
      redo(v);
      v.focus();
    },
    getSnapshot: () => snapshot(view.current!.state),
    apply(edit) {
      const v = view.current!;
      v.dispatch({ changes: edit.changes, selection: { anchor: edit.from, head: edit.to } });
      v.focus();
    },
    insert(text) {
      const v = view.current!;
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
    scrollToRatio(r) {
      const s = view.current?.scrollDOM;
      if (s) s.scrollTop = r * (s.scrollHeight - s.clientHeight);
    },
    focus: () => view.current?.focus(),
  };
  useImperativeHandle(ref, () => api);

  return <div ref={host} className="h-full overflow-hidden [&_.cm-editor]:h-full" />;
});

export default MarkdownEditor;
