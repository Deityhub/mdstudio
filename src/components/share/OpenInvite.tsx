import { useNavigate } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { useEffect, useState } from "react";
import { ReaderSignIn } from "@/components/share/ReaderSignIn";
import { Standalone, StandaloneBox } from "@/components/site/Standalone";
import { Button } from "@/components/ui/button";
import { accountStore, cloudReady, useAccount } from "@/lib/account/store";
import { CollabError, collabApi } from "@/lib/collab/api";
import { openTarget } from "@/lib/collab/shared";
import { documentStore } from "@/lib/storage/documentStore";
import { AuthExpiredError, UnverifiedError } from "@/lib/sync/api";

type Step = "working" | "signin" | "confirm" | "denied" | "failed";

/**
 * What a draft's address (/c/<link>, from an invitation) does: sign in if needed and stay on this
 * page, then open the draft in the live editor (the owner is taken to their own draft). A person who was not invited, and an address that
 * leads nowhere, get the same answer, so it never says whether a draft exists.
 */
export function OpenInvite({ link }: { link: string }) {
  const account = useAccount();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("working");
  const [signIn, setSignIn] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [checking, setChecking] = useState(false);
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
        const id = await openTarget(documentStore, user.id, item);
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
    <Standalone>
      <StandaloneBox>
        <Users className="size-8 text-primary" aria-hidden="true" />
        {step === "working" && (
          <>
            <h1 className="font-display text-[22px] font-semibold">Opening the draft…</h1>
            <p className="text-muted-foreground" role="status">
              One moment.
            </p>
          </>
        )}
        {step === "signin" && (
          <>
            <h1 className="font-display text-[22px] font-semibold">Sign in to open the draft</h1>
            <p className="text-muted-foreground">
              You were invited to edit a draft together. Sign in with the email address the
              invitation was sent to, or create an account with it.
            </p>
            <Button size="lg" className="w-full" onClick={() => setSignIn(true)}>
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
            <h1 className="font-display text-[22px] font-semibold">Confirm your email first</h1>
            <p className="text-muted-foreground">
              Editing together needs a confirmed email address. Open the link we sent you, then try
              again.
            </p>
            <Button
              size="lg"
              className="w-full"
              loading={checking}
              onClick={() => {
                setChecking(true);
                void accountStore
                  .refresh()
                  .then(() => setAttempt((n) => n + 1))
                  .finally(() => setChecking(false));
              }}
            >
              I've confirmed it
            </Button>
          </>
        )}
        {step === "denied" && (
          <>
            <h1 className="font-display text-[22px] font-semibold">You can't open this draft</h1>
            <p className="text-muted-foreground">
              The link may have stopped working, or this account isn't the address that was invited.
              Sign in with the invited address, or ask the owner to invite you again.
            </p>
          </>
        )}
        {step === "failed" && (
          <>
            <h1 className="font-display text-[22px] font-semibold">Couldn't reach the server</h1>
            <p className="text-muted-foreground">Check your connection and try again.</p>
            <Button size="lg" className="w-full" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </Button>
          </>
        )}
      </StandaloneBox>
    </Standalone>
  );
}
