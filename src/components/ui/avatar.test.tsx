import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "./avatar";

describe("Avatar", () => {
  it("shows the picture, without sending the page address to the image host", () => {
    const { container } = render(<Avatar src="https://lh3/x.png" label="Ada" />);
    const img = container.querySelector("img")!;
    expect(img).toHaveAttribute("src", "https://lh3/x.png");
    expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    expect(img).toHaveAttribute("alt", "");
  });

  it("shows the first letter when there is no picture", () => {
    const { container } = render(<Avatar src={null} label="ada@example.com" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("falls back to the letter when the picture does not load", () => {
    const { container } = render(<Avatar src="https://lh3/gone.png" label="Ada" />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("tries a new picture after the old one failed", () => {
    const { container, rerender } = render(<Avatar src="https://a/1.png" label="Ada" />);
    fireEvent.error(container.querySelector("img")!);
    rerender(<Avatar src="https://a/2.png" label="Ada" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "https://a/2.png");
  });
});
