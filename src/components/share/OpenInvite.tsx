import { useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ReaderSignIn } from "@/components/share/ReaderSignIn";
import { SiteFooter } from "@/components/site/SiteFooter";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Button } from "@/components/ui/button";
import { accountStore, cloudReady, useAccount } from "@/lib/account/store";
import { CollabError, collabApi } from "@/lib/collab/api";
import { openShared } from "@/lib/collab/shared";
import { documentStore } from "@/lib/storage/documentStore";
import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";

type Step = "working" | "signin" | "confirm" | "denied" | "failed";

/**
 * What a draft's address (/c/<link>, from an invitation) does: sign in if needed and stay on this
 * page, then open the draft in the live editor. A person who was not invited, and an address that
 * leads nowhere, get the same answer, so it never says whether a draft exists.
 */
export function OpenInvite({ link }: { link: string }) {
  const account = useAccount();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("working");
  const [signIn, setSignIn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const user = account.user;
  const ready = cloudReady(account);

  useEffect(() => void accountStore.refresh(), []);

  useEffect(() => {
    if (!account.loaded) return;
    if (!user) {
      setStep("signin");
      return;
    }
    if (!ready) {
      setStep("confirm");
      return;
    }
    let live = true;
    setStep("working");
    collabApi
      .open(link)
      .then(async (item) => {
        const id = await openShared(documentStore, user.id, item);
        if (live) void navigate({ to: "/editor/$docId", params: { docId: id }, replace: true });
      })
      .catch((error) => {
        if (!live) return;
        if (error instanceof AuthExpiredError) void accountStore.refresh();
        else if (error instanceof UnverifiedError) setStep("confirm");
        else if (error instanceof CollabError && error.code === "not_found") setStep("denied");
        else setStep("failed");
      });
    return () => {
      live = false;
    };
  }, [account.loaded, user, ready, link, attempt, navigate]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-16 text-center">
        <Users className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
        {step === "working" && (
          <>
            <h1 className="mt-4 font-display text-2xl font-semibold">Opening the draft…</h1>
            <p className="mt-2 text-muted-foreground" role="status">
              One moment.
            </p>
          </>
        )}
        {step === "signin" && (
          <>
            <h1 className="mt-4 font-display text-2xl font-semibold">Sign in to open the draft</h1>
            <p className="mt-2 text-muted-foreground">
              You were invited to edit a draft together. Sign in with the email address the
              invitation was sent to, or create an account with it.
            </p>
            <Button className="mt-6" onClick={() => setSignIn(true)}>
              Sign in
            </Button>
            <ReaderSignIn
              open={signIn}
              onOpenChange={setSignIn}
              onSignedIn={() => undefined}
              reason="Use the email address the invitation was sent to."
              confirmFor="open the draft"
            />
          </>
        )}
        {step === "confirm" && (
          <>
            <h1 className="mt-4 font-display text-2xl font-semibold">Confirm your email first</h1>
            <p className="mt-2 text-muted-foreground">
              Editing together needs a confirmed email address. Open the link we sent you, then try
              again.
            </p>
            <Button
              className="mt-6"
              onClick={() => void accountStore.refresh().then(() => setAttempt((n) => n + 1))}
            >
              I've confirmed it
            </Button>
          </>
        )}
        {step === "denied" && (
          <>
            <h1 className="mt-4 font-display text-2xl font-semibold">You can't open this draft</h1>
            <p className="mt-2 text-muted-foreground">
              The link may have stopped working, or this account isn't the address that was invited.
              Sign in with the invited address, or ask the owner to invite you again.
            </p>
          </>
        )}
        {step === "failed" && (
          <>
            <h1 className="mt-4 font-display text-2xl font-semibold">Couldn't reach the server</h1>
            <p className="mt-2 text-muted-foreground">Check your connection and try again.</p>
            <Button className="mt-6" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
