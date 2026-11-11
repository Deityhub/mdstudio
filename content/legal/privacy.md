This policy covers the hosted mdstudio at {{site}}, run by the mdstudio maintainers ("we", "us"). If you self-host mdstudio, whoever runs your copy is responsible for your data, and this policy does not apply to it.

The short version: mdstudio is local-first. You can write, preview, check and export without an account, and then nothing you write leaves your browser. An account is optional and adds features that need a server. There is no advertising, no analytics and no tracking.

## What stays in your browser

Without an account, everything is stored on your device:

- Your drafts and their saved versions (IndexedDB).
- Your settings: theme, checker rules, library folders and similar (localStorage).
- A copy of the app's files, so it works offline (the browser cache).

We never receive these. Clearing your browser's site data deletes them.

## AI helpers

The AI helpers are optional and use your own API key. Your key is kept in memory for the session only, and it is never saved or sent to mdstudio. When you run a helper, the selected text or draft goes directly from your browser to the provider you chose (OpenAI, Anthropic, Google, Ollama or another compatible endpoint). It does not pass through our servers. What the provider does with it is governed by your agreement with them.

If you are signed in, the name, provider, address and model of your AI setups are saved to your account so they follow you between devices. The API keys are not.

## What we store when you have an account

- **Account details:** your email address, a hash of your password (never the password itself), your display name, and the time the account was created.
- **Sign-in with Google or GitHub:** see the next section. We store the provider's ID for you, your profile picture's address, and your name.
- **Sessions:** a hash of your session token and its expiry. No IP address or device details are stored with it.
- **Email links:** hashes of the one-time links for confirming your email and resetting your password, until they expire or are used.
- **Cloud drafts:** only drafts you choose to put in the cloud. The text, the title and a limited number of earlier versions are stored. Drafts are not end-to-end encrypted: they are stored in a database that we administer, and the admin tools we use show titles and sizes, not text.
- **Share links and comments:** see below.
- **GitHub publishing:** only if you connect it. See below.
- **Account limits and admin records:** your plan and limits, whether the account is suspended, and a log of admin actions (who did what to which account).

## Sign-in with Google

When you choose "Continue with Google", we ask Google for three things: your email address, your name and your profile picture, together with your Google account's ID. We use them to create your account or sign you in, and to show your name and picture in the app. We do not ask for access to your Gmail, Drive, Calendar, contacts or anything else in your Google account, and we do not keep the access token Google gives us; it is used once during sign-in and discarded.

mdstudio's use and transfer to any other app of information received from Google APIs adheres to the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy), including the Limited Use requirements. We do not use this information for advertising, we do not sell it, and we do not let people read it except as needed to run your account, to provide support you ask for, to keep the service secure, or to follow the law.

You can remove mdstudio's access at any time in your Google Account under Security, "Your connections to third-party apps and services". That does not delete your mdstudio account; see "Your choices" below.

If you sign in with Google or GitHub and an account with the same verified email address already exists, the new sign-in is added to that account, so one person ends up with one account. If that account was created with a password but its email address was never confirmed, the password is removed when this happens.

## Sign-in with GitHub, and publishing to GitHub

Signing in with GitHub gives us your GitHub ID, name, profile picture and your verified email address. No access to your repositories is requested.

Publishing to GitHub is a separate step that you start yourself. It asks GitHub for permission to write to your public repositories and gists (or to private repositories, if you choose that), and we store the resulting access token encrypted. It is used only when you publish. When you publish, your draft and its images are sent to GitHub, and they are then governed by GitHub's terms. You can disconnect at any time, which revokes the token at GitHub and deletes it from our database.

## Share links and comments

A share link publishes a copy of a cloud draft at a public address. Understand what that means before you use it:

- Anyone with the link can read the title and text you published. Public links can be indexed by search engines and copied by others. Expiry stops our site from serving the page, but cannot remove copies that others have made.
- A link expires after 1 to 7 days, as you choose. Expired links stop working at once. The expired copy and its comments are kept for 30 days for you, then deleted.
- You can make a link private to invited email addresses. Readers must then sign in with one of those addresses. Invitations are sent by email.
- If comments are on, signed-in readers can comment. Comments show the commenter's display name, never their email address. If your display name came from Google or GitHub, that is the name shown.

## Email

We send email for confirming your address, password resets, share invitations and notices that someone commented on your shared draft (at most one an hour per link, and never the comment itself). These go through an email provider (currently Resend or Mailtrap), which receives the recipient address and the message.

## Technical data

- **Hosting:** the site runs on Cloudflare (Workers, D1 database, and its network). Cloudflare processes IP addresses and request details to deliver and protect the site, and may keep logs under [its own privacy policy](https://www.cloudflare.com/privacypolicy/).
- **Abuse limits:** to limit sign-up and sign-in abuse, we keep short-lived counters tied to your IP address (and to the email address being tried). They exist only for the length of the limit, at most about an hour, and are then deleted.
- **Sign-up check:** sign-up may use Cloudflare Turnstile to tell people from bots. Turnstile runs in your browser and sends information about it to Cloudflare.
- **Errors:** if a server error occurs, the error and where it happened are logged so we can fix it. Request contents, such as your draft text, are not logged.

## Cookies and local storage

- One session cookie while you are signed in. It is HttpOnly and used only to keep you signed in.
- A short-lived cookie (10 minutes) while you are signing in with Google or GitHub, to protect that sign-in against forgery.
- Local storage and the browser cache, as described above.

We do not use analytics, advertising or tracking cookies.

## Who receives data

We do not sell personal data. Data goes only to the services needed to run mdstudio, each only for its job: Cloudflare (hosting, security), the email provider (email), Google and GitHub (sign-in, and GitHub for publishing when you ask), and the AI provider you choose (only when you run an AI helper, directly from your browser). We may also disclose data when the law requires it.

## How long we keep data

- Account data and cloud drafts: until you delete them or the account is deleted.
- Sessions: 24 hours, renewed while you use the site, and never more than 5 days after you signed in.
- Email confirmation links: 24 hours. Password reset links: 1 hour.
- When an account is deleted, its drafts, versions, share links, comments, GitHub connection and sessions are deleted with it. Cloudflare keeps short-lived database backups, so deleted data can remain in them for a limited time (up to 30 days).

## Your choices and rights

You can delete cloud drafts and remove a draft from the cloud in the app, end a share link, and disconnect GitHub. You can ask us for a copy of your data, to correct it, or to delete your account and everything stored with it, by emailing [{{contact}}](mailto:{{contact}}) from the address on the account. We will act on a request within 30 days. There is no delete button for the whole account yet.

Depending on where you live (for example in the EU, the UK or California), you may also have the right to object to or restrict how your data is used, to receive it in a portable form, and to complain to your data protection authority. We rely on these grounds: providing the service you asked for (your account and its features), our legitimate interest in keeping the service secure and free of abuse, and your consent where you choose Google or GitHub sign-in or the optional features.

## Security

Passwords are stored as salted hashes, session and email tokens are stored as hashes, GitHub tokens are encrypted, and everything is served over HTTPS. No system is completely secure. If you find a vulnerability, please report it to [{{contact}}](mailto:{{contact}}).

## Changes

If we change this policy, we will update the date below and, for a significant change, show a notice in the app. The version in force is the one on this page.

## Contact

mdstudio is maintained by [{{author}}]({{authorUrl}}) and you can reach him directly.
