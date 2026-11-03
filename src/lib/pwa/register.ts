/**
 * Registers the service worker (public/sw.js) in production builds. The version in the URL makes
 * every release a new worker with a fresh cache. Pull request previews are short-lived, so they
 * skip it.
 */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || !import.meta.env.PROD) return;
  if (import.meta.env.VITE_PREVIEW === "true") return;
  const version = encodeURIComponent(import.meta.env.VITE_APP_VERSION ?? "dev");
  const start = () =>
    navigator.serviceWorker
      .register(`/sw.js?v=${version}`)
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Files fetched before the worker took control (the first visit) were not seen by it.
        // Give the lazy chunks a moment to load, then hand over what the page has used.
        setTimeout(() => {
          const urls = performance
            .getEntriesByType("resource")
            .map((e) => new URL(e.name).pathname)
            .filter(
              (p) => p.startsWith("/assets/") || p.startsWith("/fonts/") || p.startsWith("/katex/"),
            );
          reg.active?.postMessage({ type: "cache-urls", urls });
        }, 3000);
      })
      .catch((error) => console.error("Offline support couldn't start", error));
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start, { once: true });
}
