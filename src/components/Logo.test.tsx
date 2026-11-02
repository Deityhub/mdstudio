import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "./Logo";

const svg = (c: HTMLElement) => c.querySelector("svg");

describe("Logo", () => {
  it("shows the mark and the name by default", () => {
    const { container } = render(<Logo link={false} />);
    expect(svg(container)).not.toBeNull();
    expect(container).toHaveTextContent("mdstudio");
  });
  it("can show only the mark", () => {
    const { container } = render(<Logo variant="mark" link={false} />);
    expect(svg(container)).not.toBeNull();
    expect(container).not.toHaveTextContent("mdstudio");
  });
  it("can show only the wordmark", () => {
    const { container } = render(<Logo variant="wordmark" link={false} />);
    expect(svg(container)).toBeNull();
    expect(container).toHaveTextContent("mdstudio");
  });
  it("hides the decorative mark from assistive tech", () => {
    const { container } = render(<Logo link={false} />);
    expect(svg(container)).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("link")).toBeNull();
  });
});
