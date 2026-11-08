import { describe, expect, it } from "vitest";
import { imageFile, imagePath, publishBranch, validBranch, validPath, validRepo } from "./protocol";

describe("validRepo", () => {
  it("is owner/name with GitHub's characters", () => {
    expect(validRepo("Deityhub/mdstudio")).toBe(true);
    expect(validRepo("a.b/c_d-e")).toBe(true);
    for (const bad of ["mdstudio", "a/b/c", "/b", "a/", "a b/c", "a/../b", "a/b?x=1", ""])
      expect(validRepo(bad)).toBe(false);
  });
});

describe("validBranch", () => {
  it("accepts ordinary branch names and refuses git's special forms", () => {
    expect(validBranch("main")).toBe(true);
    expect(validBranch("feature/x-1.2")).toBe(true);
    for (const bad of [
      "",
      "-x",
      "a..b",
      "a b",
      "a~1",
      "a^",
      "a:b",
      "a\\b",
      "x.lock",
      "/a",
      "a/",
      "@{x}",
      "a//b",
    ])
      expect(validBranch(bad)).toBe(false);
  });
});

describe("validPath", () => {
  it("normalizes a path inside the repository", () => {
    expect(validPath("posts/hello.md")).toBe("posts/hello.md");
    expect(validPath("  README.md ")).toBe("README.md");
    expect(validPath("docs//a.md")).toBe("docs/a.md");
  });

  it("refuses leaving the repository, git internals and odd names", () => {
    for (const bad of [
      "",
      "/etc/passwd",
      "../x.md",
      "a/../../x.md",
      ".git/config",
      "a/.git/x.md",
      "a/./b.md",
      "a\\b.md",
      "a/b/",
      "x".repeat(300),
      "bad\u0000.md",
    ])
      expect(validPath(bad)).toBeNull();
  });
});

describe("imageFile and imagePath", () => {
  it("accepts plain image file names only", () => {
    expect(imageFile("photo.png")).toBe(true);
    expect(imageFile("my photo (1).JPG")).toBe(true);
    for (const bad of ["a/b.png", "../a.png", "a.exe", ".png", "a.png.html", "a\\b.png", ""])
      expect(imageFile(bad)).toBe(false);
  });

  it("puts the images beside the file in an images folder", () => {
    expect(imagePath("posts/hello.md", "a.png")).toBe("posts/images/a.png");
    expect(imagePath("README.md", "a.png")).toBe("images/a.png");
  });
});

describe("publishBranch", () => {
  it("names a new branch from the title and the time", () => {
    const at = Date.UTC(2026, 10, 12, 8, 5);
    expect(publishBranch("My First Post!", at)).toBe("mdstudio/my-first-post-20261112-0805");
    expect(publishBranch("***", at)).toBe("mdstudio/untitled-20261112-0805");
    expect(validBranch(publishBranch("Ünïcode ✨ title", at))).toBe(true);
  });
});
