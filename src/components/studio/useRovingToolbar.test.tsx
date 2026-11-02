import { useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRovingToolbar } from "./useRovingToolbar";

function Bar() {
  const ref = useRef<HTMLDivElement>(null);
  const onKeyDown = useRovingToolbar(ref);
  return (
    <div ref={ref} role="toolbar" onKeyDown={onKeyDown}>
      <button>A</button>
      <button>B</button>
      <button disabled>C</button>
      <button>D</button>
    </div>
  );
}

const tab = (el: HTMLElement) => el.getAttribute("tabindex");

describe("useRovingToolbar", () => {
  it("makes a single tab stop and moves it with the arrow keys, skipping disabled buttons", () => {
    const { getByText, getByRole } = render(<Bar />);
    const [a, b, , d] = ["A", "B", "C", "D"].map((t) => getByText(t));
    expect([tab(a!), tab(b!), tab(d!)]).toEqual(["0", "-1", "-1"]);

    a!.focus();
    fireEvent.keyDown(getByRole("toolbar"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(b);
    expect([tab(a!), tab(b!)]).toEqual(["-1", "0"]);

    fireEvent.keyDown(getByRole("toolbar"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(d);
    fireEvent.keyDown(getByRole("toolbar"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(a); // wraps
    fireEvent.keyDown(getByRole("toolbar"), { key: "End" });
    expect(document.activeElement).toBe(d);
    fireEvent.keyDown(getByRole("toolbar"), { key: "Home" });
    expect(document.activeElement).toBe(a);
    fireEvent.keyDown(getByRole("toolbar"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(d); // wraps backwards
  });
});
