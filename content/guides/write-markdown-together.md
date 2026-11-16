---
slug: write-markdown-together
title: Write a Markdown Draft Together, Online or Offline
description: "How several people edit one Markdown draft at once: inviting people, cursors and undo, what happens when someone goes offline, and the limits to know first."
order: 10
published: 2026-11-16T11:36:00Z
updated: 2026-11-16T11:36:00Z
---

Two people editing one file usually means taking turns, or merging by hand. For a document you both want to move quickly, such as a README, a proposal or a post with a deadline, that is slow. Editing the same draft at the same time removes the turn-taking. This guide explains how it works in mdstudio, what is merged for you, and where it stops.

## Starting a shared draft

Open the draft's menu and choose **Share**, then **Edit together**, and invite people by email address. The draft has to be kept in your cloud, and the people you invite need a confirmed account on that address. Invited people find the draft under "Shared with you" in their library and open it from there.

By default up to 3 people, including you, can edit one draft, and an account can have 2 of these live at a time. A server's admin can change both limits, and can switch the feature off. You can stop editing together at any time, which returns the draft to normal syncing.

## What you see while you write

Everyone's cursor and selection appear in the text with a name and a colour, and an avatar stack in the header shows who is in the draft. Undo is personal: pressing it reverts your own last edit, never someone else's. A small indicator tells you whether you are live, reconnecting or offline.

## Offline edits merge

This is the part that is hard with files and easy here. If you lose the connection, you can keep writing. Your edits are kept on your device, and when the network returns they are sent and merged with what everyone else did in the meantime. Nobody has to resolve a conflict by choosing one version.

If two people change the same spot while apart, both keep their text, and the order of the two pieces is decided consistently for everyone, so the result is the same on every device. It can read oddly, since two people wrote the same sentence differently, but nothing is lost. Reread the passage after a reconnect.

## What happens to the saved copy

The text people edit together is the live draft. A copy of it is kept up to date in the owner's cloud draft within a short time after anyone stops typing, so history, sharing and publishing work from current text. If the owner restores an older version, it is applied as an ordinary edit that everyone sees.

## Limits worth knowing

- Only the text is shared live. The name and folder of the draft are not synced between people while it is live.
- Images pasted into the text as local data are not shared. Use hosted images, or a link, so everyone sees them.
- People you invite can edit, but cannot reshare the draft, publish it to GitHub or delete it. Those stay with the owner.
- Removing a person, or deleting the draft, ends their access straight away. They keep a plain local copy of what they had, and nothing is destroyed.
- There are no comments or suggestions inside the live editor. For feedback from people who should not edit, use a [review link](/guides/share-markdown-for-review).

## When to use it

Edit together when two or three people are producing the same text. Use a review link when you want feedback on a finished copy from many readers. And write the final text for the place it is going: read [portable Markdown](/guides/markdown-portability) before you publish. To try it, [open the editor](/editor).
