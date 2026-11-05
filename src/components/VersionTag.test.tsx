import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VersionTag } from "./VersionTag";

describe("VersionTag", () => {
  it("shows the version with a v, named for assistive tech", () => {
    render(<VersionTag version="0.2.0" />);
    const tag = screen.getByLabelText("Version 0.2.0");
    expect(tag).toHaveTextContent("v0.2.0");
    expect(tag).toHaveAttribute("title", "mdstudio v0.2.0");
  });

  it("does not double a v that is already there", () => {
    render(<VersionTag version="v1.0.0" />);
    expect(screen.getByLabelText("Version 1.0.0")).toHaveTextContent("v1.0.0");
  });

  it("shows nothing when there is no version to show", () => {
    const { container } = render(<VersionTag version="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
