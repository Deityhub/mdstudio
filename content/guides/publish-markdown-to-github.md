---
slug: publish-markdown-to-github
title: Publish Markdown to GitHub from an Editor
description: "Send a Markdown draft to a GitHub repository as a commit, a pull request or a gist, with its images, and what to know about connecting and republishing."
order: 9
published: 2026-11-16T11:03:00Z
updated: 2026-11-16T11:03:00Z
---

For a README, a documentation page or a blog kept in a repository, the last step is copying the text into a file, committing it, and fixing the image paths. It is easy to get one of those wrong. Publishing straight from the editor removes the copying, and puts the image files where the text already points. This guide explains what mdstudio does when you publish a draft to GitHub, and what it does not do.

## Connecting GitHub is a separate step

Signing in with GitHub only identifies you. It asks for no access to your repositories and keeps no token. To publish, you connect GitHub explicitly, from the Publish dialog or from Settings, and GitHub asks you to approve it. mdstudio asks for access to public repositories and gists, or to private repositories when you choose that option. The token is stored encrypted on the server and never sent to your browser. You can disconnect at any time.

Publishing is available for a draft kept in your cloud, with a confirmed email address.

## Commit, pull request or gist

Pick a repository, a branch and a path, including any folders, such as `posts/my-post.md`. Then choose how it goes in:

- **Commit** puts the file on the branch you chose. If the branch moved while you were publishing, mdstudio stops and tells you, instead of overwriting anything.
- **Pull request** puts the commit on a new branch named after the draft and the time, and opens a pull request against the branch you chose. Use it when someone has to approve a change.
- **Gist** publishes the text as a secret gist unless you make it public. Publishing again updates the same gist, and it is created again if you deleted it.

## Images come with the file

A draft often points at images such as `images/diagram.png`. Publishing commits those files into an `images` folder beside the Markdown file, which is where the text already points, so the links work in the repository without edits. Images pasted into the text as base64 data are taken out and committed as files, so no base64 ends up in the repository. There is a limit of 20 images and about 4.5 MB in one publish.

## Publishing again, and not overwriting by accident

Publishing the same draft again updates the same file. If a file already exists at that path and this draft did not put it there, or someone changed it since, mdstudio will not replace it unless you confirm that you want to. This protects work that does not belong to the draft.

## Write for the repository

Because the text goes to GitHub, write for GitHub:

- Use the GFM extended target, so tables, task lists, alerts and footnotes are expected.
- Use relative links between files in the repository, and hosted URLs for everything else.
- Give code fences a language, and keep one blank line between paragraphs.

The checker warns about links to local files, because they break once the text leaves its folder. Inside a repository a relative link to another file is correct, so read those warnings with the repository's layout in mind.

## When something else is the destination

Not everything is published through a repository. If you are sending the text to a platform that takes pasted Markdown, export clean Markdown with the target set to the one that matches, and read [writing Markdown for blogging platforms](https://mdstudio.deityhub.com/guides/markdown-for-blogging-platforms). To get a second opinion before you commit, see [sharing a draft for review](https://mdstudio.deityhub.com/guides/share-markdown-for-review). To try publishing, [open the editor](https://mdstudio.deityhub.com/editor).
