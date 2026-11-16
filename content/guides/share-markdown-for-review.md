---
slug: share-markdown-for-review
title: Share a Markdown Draft for Review Before You Publish
description: "Get feedback on a Markdown draft before it goes live: an expiring read-only copy, who can open it, comments on selected words, and what happens as you edit."
order: 8
published: 2026-11-16T10:27:00Z
updated: 2026-11-16T10:27:00Z
---

Sending someone a Markdown file for feedback is awkward. They need an editor that renders it, they reply in a chat thread with line numbers you have to hunt for, and by the time you have fixed the first round, the file they hold is out of date. A read-only page with comments on the exact words solves most of that. This guide explains how review links in mdstudio work, and the choices you make when you create one.

## What a review link is

A review link is a copy of a draft, published at its own web address. It is not the draft itself. The page shows the text rendered the way the editor's preview shows it, with math and diagrams drawn in the reader's browser, and it has no controls for editing. Readers need no editor and no account to read a public link.

Only a draft that is kept in your cloud can be shared, and your email address has to be confirmed first. Choose **Share** on the draft, then **Share for review**.

## It expires, on purpose

Every link has a lifetime of 1 to 7 days, 4 by default. You can lengthen or shorten it while it is live, and you can stop sharing at any moment, after which the address stops working. A link that has run out can be published again under a new address. The expiry is there so that a draft you meant to show for a week does not sit on the web forever.

## Public, or only for named people

A **public** link opens for anyone who has the address, and because it is a public web page, search engines can index it. Treat it like publishing. Do not use it for anything you would not put on a website.

A link limited to **named people** lists the email addresses you invite. A reader has to sign in with a confirmed account on one of those addresses. Anyone else, including a signed-out visitor who guesses the address, gets a plain "not found", so the page does not reveal that it exists. Private pages are never indexed and are never cached publicly. Each invited address gets one email with who shared it, the title, the expiry date and a button.

## Comments on the exact words

When you turn comments on, signed-in readers with a confirmed email can select text on the page and comment on it. A comment is plain text, shown with the reader's display name and never their address, and anyone can reply in the thread. You see the comments in the editor, next to the draft, and you can resolve or delete them. You get at most one email an hour per link saying that something was said, and never what was said.

## When you keep writing

The page does not change when you edit the draft. It keeps the text you published until you choose to publish an update. That is deliberate: reviewers always comment on a fixed copy, and you can keep working without readers seeing half-finished sentences.

When you do publish an update, comments written on the earlier copy are found again by the words they were attached to, and marked as being on an earlier version, so you can tell what still applies. Open pages show that an update has arrived and offer to reload.

## A short review routine

1. Finish a draft you would be willing to show, and check it in the editor first.
2. Share it for review, with the people you want to hear from, and a lifetime that fits the deadline.
3. Resolve each comment as you deal with it, and publish an update when you want a second look.
4. When you are done, stop sharing. Your draft is unchanged, and an expired link and its comments stay available to you for 30 days.

Review is one step in a longer flow. For editing the same draft at the same time as someone else, read [writing a Markdown draft together](https://mdstudio.deityhub.com/guides/write-markdown-together). To send the finished text on, see [publishing Markdown to GitHub](https://mdstudio.deityhub.com/guides/publish-markdown-to-github). To try it, [open the editor](https://mdstudio.deityhub.com/editor).
