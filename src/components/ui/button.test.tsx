import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";

const spinner = (c: HTMLElement) => c.querySelector("[data-spinner]");

describe("Button states", () => {
  it("is a normal, clickable button by default", () => {
    const onClick = vi.fn();
    const { container } = render(<Button onClick={onClick}>Save</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button")).toBeEnabled();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    expect(spinner(container)).toBeNull();
  });

  it("pending disables the button without a spinner", () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button pending onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(spinner(container)).toBeNull();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("loading disables the button and shows a spinner, keeping the label", () => {
    const { container } = render(<Button loading>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(spinner(container)).not.toBeNull();
    expect(spinner(container)).toHaveAttribute("aria-hidden", "true");
  });

  it("an icon button shows only the spinner while loading", () => {
    const { container } = render(
      <Button size="icon" loading aria-label="Refresh">
        <svg data-testid="icon" />
      </Button>,
    );
    expect(spinner(container)).not.toBeNull();
    expect(screen.queryByTestId("icon")).toBeNull();
  });

  it("stays disabled when asked to, and works as a link wrapper", () => {
    render(<Button disabled>Save</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("button")).not.toHaveAttribute("aria-busy");
    render(
      <Button asChild loading>
        <a href="/x">Go</a>
      </Button>,
    );
    expect(screen.getByRole("link", { name: "Go" })).toHaveAttribute("aria-busy", "true");
  });
});
