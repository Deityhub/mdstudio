import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { Switch } from "./switch";

function Demo() {
  const [on, setOn] = useState(false);
  return <Switch aria-label="Normalize" checked={on} onCheckedChange={setOn} />;
}

describe("Switch", () => {
  it("turns on and off, and says so", () => {
    render(<Demo />);
    const toggle = screen.getByRole("switch", { name: "Normalize" });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("has a knob with colours of its own, so a card cannot make it vanish", () => {
    const { container } = render(<Demo />);
    const knob = container.querySelector("span[data-state]")!;
    // the page background is what a card resets to transparent, so the knob must not use it
    expect(knob.className).not.toContain("bg-background");
    expect(knob.className).toContain("data-[state=unchecked]:bg-muted-foreground");
    expect(knob.className).toContain("data-[state=checked]:bg-primary-foreground");
  });

  it("cannot be changed when disabled", () => {
    render(<Switch aria-label="Locked" disabled />);
    const toggle = screen.getByRole("switch", { name: "Locked" });
    fireEvent.click(toggle);
    expect(toggle).toBeDisabled();
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });
});
