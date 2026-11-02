CommonMark and GitHub Flavored Markdown (GFM) are the two Markdown standards you will meet most often. GFM is a strict superset of CommonMark, which means every valid CommonMark document is also valid GFM, but not the other way round. Knowing exactly what GFM adds tells you when your text stops being universally portable.

## What CommonMark is

CommonMark is a precise, test-driven specification of Markdown. It defines headings, emphasis, lists, block quotes, code blocks, links, images, hard and soft line breaks, and inline or block HTML. Two implementations that follow it produce the same output for the same input, which the original Markdown description never guaranteed.

If you want text that renders predictably in any compliant tool, CommonMark is the safe baseline.

## What GFM adds

GitHub Flavored Markdown is defined as a formal extension of CommonMark. The additions are:

| Feature | Example | In strict CommonMark |
| --- | --- | --- |
| Tables | pipes and a delimiter row | Not supported, shown as plain text |
| Task lists | a list item starting with a bracketed space or x | Shown as literal brackets |
| Strikethrough | text wrapped in double tildes | Shown as literal tildes |
| Extended autolinks | a bare web address becomes a link | Only angle-bracket autolinks work |
| Disallowed raw HTML | some tags are filtered | Raw HTML passes through |

```md
| Name  | Status |
| ----- | ------ |
| Alpha | Done   |

- [x] Write the draft
- [ ] Publish it

This is ~~removed~~ text.
```

## Features that sit on top of GFM

Many things people call GitHub Markdown are newer additions that GitHub supports but the GFM specification does not describe:

- Footnotes.
- Alerts, written as a block quote starting with a marker such as a NOTE or WARNING label in square brackets.
- LaTeX math and Mermaid diagrams.
- Emoji shortcodes and user mentions.

Other platforms may support some of these, all of them or none. That is why a document that looks perfect on GitHub can still break elsewhere.

## Which one should you write for

- **Writing a README or docs for GitHub:** use GFM. Tables and task lists are expected there.
- **Writing for several platforms or a static site generator:** stay close to CommonMark and use GFM extensions only when every target supports them. Most modern platforms do support tables and task lists.
- **Writing for a tool you do not control:** assume only CommonMark and test the result.

## Practical differences to remember

- A pipe table without a delimiter row is not a table, in any flavor.
- Strikethrough with a single tilde works in some GFM implementations and not others, so use two.
- Footnotes and alerts are not CommonMark and not part of the GFM specification, so check each target.
- Raw HTML is allowed by CommonMark, but GFM filters a small set of dangerous tags and most platforms sanitize far more.

## Check which flavor you are using

It is easy to use a GFM feature without noticing. [mdstudio](https://mdstudio.deityhub.com/editor) lets you switch the target profile between Strict CommonMark, GitHub, dev.to and Obsidian. On Strict CommonMark, the checker flags every table, task list, strikethrough and footnote as a GFM extension, so you can see exactly where your text depends on one. The editor is free, open source and keeps your drafts in your browser. Read more in the [portable Markdown guide](https://mdstudio.deityhub.com/guides/markdown-portability).
