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
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { search, searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { classHighlighter } from "@lezer/highlight";

export type EditorHandle = {
  wrap: (before: string, after?: string, placeholder?: string) => void;
  linePrefix: (prefix: string) => void;
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
};

const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cb = useRef(props);
  cb.current = props;
  const silent = useRef(false);

  useEffect(() => {
    const wrapCmd =
      (before: string, after = before) =>
      (v: EditorView) => {
        api.wrap(before, after);
        return !!v;
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
          { key: "Mod-b", run: wrapCmd("**") },
          { key: "Mod-i", run: wrapCmd("_") },
          { key: "Mod-k", run: (v) => (api.wrap("[", "](https://)", "link text"), !!v) },
          ...searchKeymap,
          ...historyKeymap,
          indentWithTab,
          ...defaultKeymap,
        ]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged && !silent.current) cb.current.onChange(u.state.doc.toString());
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
    wrap(before, after = before, placeholder = "text") {
      const v = view.current!;
      const { from, to } = v.state.selection.main;
      const sel = v.state.sliceDoc(from, to) || placeholder;
      v.dispatch({
        changes: { from, to, insert: before + sel + after },
        selection: { anchor: from + before.length, head: from + before.length + sel.length },
      });
      v.focus();
    },
    linePrefix(prefix) {
      const v = view.current!;
      const { from, to } = v.state.selection.main;
      const start = v.state.doc.lineAt(from).number;
      const end = v.state.doc.lineAt(to).number;
      const changes = [];
      for (let n = start; n <= end; n++) {
        const line = v.state.doc.line(n);
        const stripped = line.text.replace(/^(#{1,6}\s|>\s|-\s|\d+\.\s)/, "");
        changes.push({
          from: line.from,
          to: line.to,
          insert: (line.text.startsWith(prefix) ? "" : prefix) + stripped,
        });
      }
      v.dispatch({ changes });
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
