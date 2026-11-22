import { Check, ExternalLink, Github, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { handleAccountError } from "@/lib/account/errors";
import type { CheckConfig } from "@/lib/checker/config";
import { publishIssues } from "@/lib/github/checks";
import { GithubError, type GithubStatus, connectUrl, githubApi } from "@/lib/github/api";
import {
  type Publication,
  type PublishMode,
  type PublishResult,
  type RepoInfo,
  defaultPath,
  validRepo,
} from "@/lib/github/protocol";
import { contentHash } from "@/lib/share/hash";
import { shareDate } from "@/lib/share/page";
import type { MdDocument } from "@/lib/storage/documentStore";
import { extractDataImages, usedImages } from "@/lib/storage/archive";

/** Set before leaving for GitHub, so the editor reopens this dialog on the draft when it is back. */
export const PUBLISH_AFTER_CONNECT = "mdstudio:publish-after-connect";

const explain = (error: unknown) =>
  error instanceof GithubError
    ? {
        not_found: "This draft hasn't reached your cloud yet. Wait for it to sync, then try again.",
        invalid: "Check the repository, branch and file path, and try again.",
        not_connected: "GitHub isn't connected, or the connection ended. Connect it again.",
        repo_not_found:
          "That repository wasn't found, or this connection can't see it. For a private repository, allow private repositories. For an organization's, the organization may need to approve mdstudio.",
        branch_not_found: "That branch wasn't found. Pick one from the list.",
        no_access: "You don't have write access to that repository.",
        exists: "A file is already there.",
        conflict: "The branch changed while publishing. Try again.",
        too_large:
          "The images are too large to send (up to 20 images, about 4.5 MB). Host them first.",
        github_failed: "GitHub didn't accept that. Try again in a moment.",
        feature_unavailable: "Publishing to GitHub isn't set up on this server.",
        too_many: "You've published a lot in the last hour. Try again a little later.",
        failed: "Couldn't reach the server. Check your connection and try again.",
      }[error.code]
    : "Something went wrong. Try again.";

/**
 * Publishes a cloud draft to the writer's GitHub: a file in a repository (committed, or as a pull
 * request) with its images beside it, or a gist. The text is the draft's copy in the cloud; the
 * dialog reads from GitHub only when it is opened or a choice needs it.
 */
export function PublishDialog({
  draft,
  open,
  onOpenChange,
  beforePublish,
  config,
}: {
  draft: MdDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Saves the draft and brings the cloud up to date, so what is published is the latest text. */
  beforePublish: () => Promise<void>;
  config: CheckConfig;
}) {
  const [status, setStatus] = useState<GithubStatus | null>(null);
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [branches, setBranches] = useState<string[] | null>(null);
  const [pubs, setPubs] = useState<Publication[]>([]);
  const [tab, setTab] = useState("repo");
  const [repo, setRepo] = useState("");
  const [branch, setBranch] = useState("");
  const [path, setPath] = useState("");
  const [mode, setMode] = useState<PublishMode>("commit");
  const [message, setMessage] = useState("");
  const [replace, setReplace] = useState(false);
  const [gistFile, setGistFile] = useState("");
  const [gistNote, setGistNote] = useState("");
  const [gistPublic, setGistPublic] = useState(false);
  const [allowPrivate, setAllowPrivate] = useState(false);
  const [busy, setBusy] = useState<"load" | "branches" | "publish" | "disconnect" | null>(null);
  const [problem, setProblem] = useState("");
  const [done, setDone] = useState<PublishResult | null>(null);
  const [stale, setStale] = useState(false);

  const draftId = draft?.id;
  const title = draft?.title ?? "";

  async function loadBranches(name: string, keep = "") {
    if (!validRepo(name)) return;
    setBusy("branches");
    setProblem("");
    try {
      const r = await githubApi.branches(name);
      setBranches(r.branches);
      setBranch(r.branches.includes(keep) ? keep : r.defaultBranch);
    } catch (error) {
      setBranches(null);
      if (!handleAccountError(error, () => onOpenChange(false))) setProblem(explain(error));
    } finally {
      setBusy(null);
    }
  }

  // Everything is read when the dialog opens: the connection, what was published before, and (when
  // connected) the repositories.
  useEffect(() => {
    if (!open || !draftId) return;
    let live = true;
    setStatus(null);
    setBranches(null);
    setRepos([]);
    setDone(null);
    setProblem("");
    setReplace(false);
    setMessage("");
    setMode("commit");
    setPath(defaultPath(title));
    setRepo("");
    setBranch("");
    setGistFile("");
    setGistNote("");
    setGistPublic(false);
    setTab("repo");
    setBusy("load");
    (async () => {
      try {
        const [st, list] = await Promise.all([githubApi.status(), githubApi.publications(draftId)]);
        if (!live) return;
        setStatus(st);
        setPubs(list);
        const file = list.find((p) => p.kind === "file");
        const gist = list.find((p) => p.kind === "gist");
        if (gist?.path) setGistFile(gist.path);
        if (!file && gist) setTab("gist");
        if (!st.connected) return;
        setRepos(await githubApi.repos());
        if (file?.repo && file.path) {
          setRepo(file.repo);
          setPath(file.path);
          if (file.branch) await loadBranches(file.repo, file.branch);
        }
      } catch (error) {
        if (live && !handleAccountError(error, () => onOpenChange(false)))
          setProblem(explain(error));
      } finally {
        if (live) setBusy(null);
      }
    })();
    return () => {
      live = false;
    };
    // read when it opens, not when the title changes under it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, draftId]);

  // has the draft moved on since the file was published?
  const file = pubs.find((p) => p.kind === "file");
  useEffect(() => {
    if (!draft || !file) return setStale(false);
    let live = true;
    void contentHash(extractDataImages(draft.content).md).then(
      (h) => live && setStale(h !== file.hash),
    );
    return () => {
      live = false;
    };
  }, [draft, file]);

  // what the GitHub profile says about the text, so problems show before they are published
  const issues = useMemo(
    () => (open && draft ? publishIssues(draft.content, draft.images, config) : []),
    [open, draft, config],
  );

  if (!draft) return null;
  const images = Object.keys(usedImages(draft.content, draft.images)).length;
  const connected = status?.connected === true;

  async function run(work: () => Promise<void>) {
    setBusy("publish");
    setProblem("");
    try {
      await work();
    } catch (error) {
      if (error instanceof GithubError && error.code === "exists") setReplace(true);
      else if (!handleAccountError(error, () => onOpenChange(false))) {
        if (error instanceof GithubError && error.code === "not_connected")
          setStatus({ available: true, connected: false });
        setProblem(explain(error));
      }
    } finally {
      setBusy(null);
    }
  }

  const publishFile = (overwrite = false) =>
    run(async () => {
      await beforePublish();
      setDone(
        await githubApi.publishFile({
          id: draft.id,
          repo: repo.trim(),
          branch,
          path: path.trim(),
          mode,
          ...(message.trim() && { message: message.trim() }),
          ...(images > 0 && { images: usedImages(draft.content, draft.images) }),
          ...(overwrite && { overwrite: true }),
        }),
      );
      setReplace(false);
    });
  const publishGist = () =>
    run(async () => {
      await beforePublish();
      setDone(
        await githubApi.publishGist({
          id: draft.id,
          public: gistPublic,
          ...(gistFile.trim() && { filename: gistFile.trim() }),
          ...(gistNote.trim() && { description: gistNote.trim() }),
        }),
      );
    });

  const connect = (withPrivate: boolean) => {
    try {
      sessionStorage.setItem(PUBLISH_AFTER_CONNECT, draft.id);
    } catch {
      // without it the editor just opens normally when the writer is back
    }
    window.location.assign(connectUrl(withPrivate));
  };
  const disconnect = async () => {
    setBusy("disconnect");
    try {
      await githubApi.disconnect();
      setStatus({ available: true, connected: false });
      setRepos([]);
      toast.success("GitHub disconnected");
    } catch (error) {
      if (!handleAccountError(error, () => onOpenChange(false))) setProblem(explain(error));
    } finally {
      setBusy(null);
    }
  };

  const sameTarget = file?.repo === repo.trim() && file.path === path.trim();
  const ready = validRepo(repo.trim()) && !!branch && !!path.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish to GitHub</DialogTitle>
          <DialogDescription>
            Put this draft in a repository or a gist. What is published is the copy in your cloud;
            later edits stay here until you publish again.
          </DialogDescription>
        </DialogHeader>

        {status === null && !problem && <p className="text-sm text-muted-foreground">Loading…</p>}

        {status && !status.available && (
          <p className="text-sm text-muted-foreground">
            Publishing to GitHub isn't set up on this server.
          </p>
        )}

        {status?.available && !connected && !done && (
          <div className="grid gap-3">
            <p className="text-sm">
              Connect your GitHub account so mdstudio can write to the repositories you choose. You
              can disconnect at any time.
            </p>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="allow-private" className="grid gap-0.5">
                Also allow private repositories
                <span className="text-sm font-normal text-muted-foreground">
                  Without this, only public repositories and gists are reachable.
                </span>
              </Label>
              <Switch id="allow-private" checked={allowPrivate} onCheckedChange={setAllowPrivate} />
            </div>
            <p className="text-sm text-muted-foreground">
              If a repository belongs to an organization, the organization may need to approve
              mdstudio before it can write there.
            </p>
            <Button
              type="button"
              className="justify-self-start"
              onClick={() => connect(allowPrivate)}
            >
              <Github /> Connect GitHub
            </Button>
          </div>
        )}

        {connected && !done && (
          <>
            <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              Connected as <strong className="text-foreground">{status?.login}</strong>
              {!status?.private && (
                <button
                  type="button"
                  className="text-primary underline-offset-4 hover:underline"
                  onClick={() => connect(true)}
                >
                  Allow private repositories
                </button>
              )}
              <button
                type="button"
                className="underline-offset-4 hover:underline"
                disabled={busy !== null}
                onClick={() => void disconnect()}
              >
                Disconnect
              </button>
            </p>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="repo">Repository</TabsTrigger>
                <TabsTrigger value="gist">Gist</TabsTrigger>
              </TabsList>

              <TabsContent value="repo" className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="pub-repo">Repository</Label>
                  <Select
                    value={repo}
                    onValueChange={(v) => {
                      setRepo(v);
                      setBranches(null);
                      setReplace(false);
                      void loadBranches(v);
                    }}
                  >
                    <SelectTrigger id="pub-repo" aria-label="Repository">
                      <SelectValue placeholder="Pick a repository" />
                    </SelectTrigger>
                    <SelectContent>
                      {repos.map((r) => (
                        <SelectItem key={r.fullName} value={r.fullName}>
                          {r.fullName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-branch">Branch</Label>
                    <Select
                      value={branch}
                      onValueChange={(v) => {
                        setBranch(v);
                        setReplace(false);
                      }}
                      disabled={!branches}
                    >
                      <SelectTrigger id="pub-branch" aria-label="Branch">
                        <SelectValue
                          placeholder={busy === "branches" ? "Loading…" : "Pick a repository"}
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {(branches ?? []).map((b) => (
                          <SelectItem key={b} value={b}>
                            {b}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="pub-path">File path</Label>
                    <Input
                      id="pub-path"
                      value={path}
                      onChange={(e) => {
                        setPath(e.target.value);
                        setReplace(false);
                      }}
                    />
                  </div>
                </div>

                <fieldset className="grid gap-1.5">
                  <legend className="text-sm font-medium">How</legend>
                  {(
                    [
                      ["commit", `Commit to ${branch || "the branch"}`],
                      ["pull_request", "Open a pull request"],
                    ] as const
                  ).map(([value, label]) => (
                    <label key={value} className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="pub-mode"
                        checked={mode === value}
                        onChange={() => setMode(value)}
                      />
                      {label}
                    </label>
                  ))}
                </fieldset>

                <div className="grid gap-1.5">
                  <Label htmlFor="pub-message">Message (optional)</Label>
                  <Input
                    id="pub-message"
                    placeholder={`${sameTarget ? "Update" : "Add"} ${path || "file"}`}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>

                {images > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {images} local image{images === 1 ? "" : "s"} will be added in an{" "}
                    <code>images</code> folder beside the file.
                  </p>
                )}
              </TabsContent>

              <TabsContent value="gist" className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="gist-file">File name</Label>
                  <Input
                    id="gist-file"
                    placeholder={defaultPath(title)}
                    value={gistFile}
                    onChange={(e) => setGistFile(e.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="gist-note">Description (optional)</Label>
                  <Input
                    id="gist-note"
                    value={gistNote}
                    onChange={(e) => setGistNote(e.target.value)}
                  />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="gist-public" className="grid gap-0.5">
                    Public gist
                    <span className="text-sm font-normal text-muted-foreground">
                      Anyone can find it. A secret gist can still be opened by anyone with the link.
                    </span>
                  </Label>
                  <Switch
                    id="gist-public"
                    checked={gistPublic}
                    onCheckedChange={setGistPublic}
                    disabled={pubs.some((p) => p.kind === "gist")}
                  />
                </div>
                {pubs.some((p) => p.kind === "gist") && (
                  <p className="text-sm text-muted-foreground">
                    This gist already exists, so it is updated in place and stays as it was made.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">Images aren't included in a gist.</p>
              </TabsContent>
            </Tabs>

            {tab === "repo" && file && (
              <p className="text-sm text-muted-foreground">
                Last published {shareDate(file.publishedAt)} to {file.repo}/{file.path}.
              </p>
            )}
            {file && stale && (
              <p role="status" className="flex items-start gap-2 text-sm text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Your draft has changes that are not published.
              </p>
            )}

            {tab === "repo" && (
              <div className="grid gap-1 text-sm" aria-label="Checks for GitHub">
                {issues.length === 0 ? (
                  <p className="text-muted-foreground">No portability problems for GitHub.</p>
                ) : (
                  <>
                    <p className="font-medium">
                      {issues.length} thing{issues.length === 1 ? "" : "s"} to look at for GitHub
                    </p>
                    <ul className="grid gap-0.5 text-muted-foreground">
                      {issues.slice(0, 3).map((i, n) => (
                        <li key={n}>
                          Line {i.line}: {i.message}
                        </li>
                      ))}
                    </ul>
                    {issues.length > 3 && (
                      <p className="text-muted-foreground">
                        and {issues.length - 3} more. Choose GitHub as the check target to see them
                        all.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {replace && (
              <div role="alert" className="grid gap-2 rounded-md border border-warning p-3 text-sm">
                <p>
                  <strong>{path}</strong> is already in {repo} on {branch}, and it wasn't published
                  from this draft or it has changed on GitHub since. Replace it?
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="justify-self-start"
                  loading={busy === "publish"}
                  onClick={() => void publishFile(true)}
                >
                  Replace it
                </Button>
              </div>
            )}
          </>
        )}

        {done && (
          <div role="status" className="grid gap-2 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Check className="size-4 text-primary" /> Published
            </p>
            <a
              className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
              href={done.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {done.pullUrl
                ? "Open the pull request"
                : done.kind === "gist"
                  ? "View the gist"
                  : "View the file"}
              <ExternalLink className="size-3.5" />
            </a>
            {done.commitUrl && !done.pullUrl && (
              <a
                className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
                href={done.commitUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                View the commit <ExternalLink className="size-3.5" />
              </a>
            )}
          </div>
        )}

        {problem && (
          <p role="alert" className="text-sm text-destructive">
            {problem}
          </p>
        )}

        <DialogFooter>
          {done ? (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          ) : (
            connected && (
              <Button
                type="button"
                loading={busy === "publish"}
                pending={busy !== null && busy !== "publish"}
                disabled={tab === "repo" ? !ready : false}
                onClick={() => void (tab === "repo" ? publishFile() : publishGist())}
              >
                {tab === "gist"
                  ? pubs.some((p) => p.kind === "gist")
                    ? "Update gist"
                    : "Create gist"
                  : mode === "pull_request"
                    ? "Open pull request"
                    : sameTarget
                      ? "Publish update"
                      : "Publish"}
              </Button>
            )
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
