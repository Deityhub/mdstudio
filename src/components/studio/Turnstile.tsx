import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (widget: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<TurnstileApi> | undefined;
const load = () =>
  (loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.turnstile!);
    script.onerror = () => {
      loading = undefined;
      reject(new Error("Couldn't load the security check"));
    };
    document.head.append(script);
  }));

/** Cloudflare's CAPTCHA for sign-up. Calls `onToken` with a token, or with "" when it lapses. */
export function Turnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const latest = useRef(onToken);
  latest.current = onToken;

  useEffect(() => {
    let widget: string | undefined;
    let gone = false;
    void load()
      .then((api) => {
        if (gone || !box.current) return;
        widget = api.render(box.current, {
          sitekey: siteKey,
          callback: (token) => latest.current(token),
          "expired-callback": () => latest.current(""),
          "error-callback": () => latest.current(""),
        });
      })
      .catch(console.error);
    return () => {
      gone = true;
      if (widget) window.turnstile?.remove(widget);
    };
  }, [siteKey]);

  return <div ref={box} data-testid="turnstile" className="min-h-16" />;
}
