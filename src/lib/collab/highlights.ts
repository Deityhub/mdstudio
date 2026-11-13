// The words that comments and suggestions are about, marked in the editor. Marks follow the words as
// text is typed around them (the anchors are Yjs relative positions) and are drawn again whenever a
// thread or the text changes. Clicking one hands its thread to the studio.
import { StateEffect } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { Threads } from "./threads";

const refresh = StateEffect.define<null>();

export function threadHighlights(threads: Threads, onPick: (id: string) => void) {
  const marks = () =>
    Decoration.set(
      threads
        .list()
        .filter((t) => t.status === "open" && !t.gone && t.to > t.from)
        .map((t) =>
          Decoration.mark({
            class: t.kind === "suggestion" ? "cm-thread cm-thread-suggestion" : "cm-thread",
            attributes: { "data-thread": t.id },
          }).range(t.from, t.to),
        ),
      true,
    );

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      private off: () => void;
      private gone = false;
      constructor(readonly view: EditorView) {
        this.decorations = marks();
        // a thread changed (or the shared text did): draw the marks again once the current update is done
        this.off = threads.observe(() =>
          queueMicrotask(() => {
            if (!this.gone) this.view.dispatch({ effects: refresh.of(null) });
          }),
        );
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.transactions.some((t) => t.effects.some((e) => e.is(refresh))))
          this.decorations = marks();
      }
      destroy() {
        this.gone = true;
        this.off();
      }
    },
    { decorations: (v) => v.decorations },
  );

  return [
    plugin,
    EditorView.domEventHandlers({
      click(e) {
        const id = (e.target as Element | null)
          ?.closest?.("[data-thread]")
          ?.getAttribute("data-thread");
        if (id) onPick(id);
        return false;
      },
    }),
  ];
}
