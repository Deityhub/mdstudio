// An in-memory stand-in for the parts of GitHub's API that publishing uses, as a `fetch`, for
// tests. It keeps real git semantics where they matter: a blob has an id that follows its content,
// a tree is built on a base tree, a commit's parent must be the branch's head to move it, and
// creating a branch twice is refused.
type Commit = { tree: string; parents: string[]; message: string };
type Repo = {
  private: boolean;
  push: boolean;
  defaultBranch: string;
  branches: Map<string, string>;
  commits: Map<string, Commit>;
  trees: Map<string, Map<string, string>>;
  blobs: Map<string, { content: string; encoding: string }>;
  pulls: { title: string; head: string; base: string; body: string; number: number }[];
};

// 40 hex characters from a string; not cryptographic, only stable and spread out
function hash40(text: string) {
  let out = "";
  for (let k = 0; k < 5; k++) {
    let h = 0x811c9dc5 ^ (k * 0x9e3779b1);
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    out += (h >>> 0).toString(16).padStart(8, "0");
  }
  return out;
}

export function fakeGithub(token = "gho_fake") {
  const repos = new Map<string, Repo>();
  const gists = new Map<
    string,
    { public: boolean; description: string; files: Record<string, string> }
  >();
  const calls: string[] = [];
  let counter = 0;
  let valid = true;
  const pretend = { gistsGone: false };

  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const notFound = () => json({ message: "Not Found" }, 404);

  function addRepo(
    name: string,
    opts: {
      private?: boolean;
      push?: boolean;
      files?: Record<string, string>;
      branch?: string;
    } = {},
  ) {
    const defaultBranch = opts.branch ?? "main";
    const repo: Repo = {
      private: opts.private ?? false,
      push: opts.push ?? true,
      defaultBranch,
      branches: new Map(),
      commits: new Map(),
      trees: new Map(),
      blobs: new Map(),
      pulls: [],
    };
    const tree = new Map<string, string>();
    for (const [path, content] of Object.entries(opts.files ?? {})) {
      const sha = hash40(`utf-8:${content}`);
      repo.blobs.set(sha, { content, encoding: "utf-8" });
      tree.set(path, sha);
    }
    const treeSha = hash40(JSON.stringify([...tree]));
    repo.trees.set(treeSha, tree);
    const commit = hash40(`init:${name}:${treeSha}`);
    repo.commits.set(commit, { tree: treeSha, parents: [], message: "initial" });
    repo.branches.set(defaultBranch, commit);
    repos.set(name, repo);
    return repo;
  }

  /** The file as the branch has it now, or undefined. */
  function fileAt(name: string, branch: string, path: string) {
    const repo = repos.get(name);
    const head = repo?.branches.get(branch);
    const blob = head && repo?.trees.get(repo.commits.get(head)!.tree)?.get(path);
    return blob ? { sha: blob, ...repo!.blobs.get(blob)! } : undefined;
  }

  const fetchFn: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    calls.push(`${method} ${url.pathname}${url.search}`);
    const auth = (init?.headers as Record<string, string> | undefined)?.["authorization"];
    if (!valid || auth !== `Bearer ${token}`) return json({ message: "Bad credentials" }, 401);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const path = url.pathname;

    if (path === "/user/repos") {
      const page = Number(url.searchParams.get("page") ?? 1);
      const all = [...repos].map(([full_name, r]) => ({
        full_name,
        private: r.private,
        default_branch: r.defaultBranch,
        permissions: { push: r.push },
      }));
      return json(all.slice((page - 1) * 100, page * 100));
    }

    if (path === "/gists" && method === "POST") {
      const id = `g${++counter}`;
      gists.set(id, {
        public: !!body["public"],
        description: String(body["description"] ?? ""),
        files: Object.fromEntries(
          Object.entries(body["files"] as Record<string, { content: string }>).map(([k, v]) => [
            k,
            v.content,
          ]),
        ),
      });
      return json({ id, html_url: `https://gist.github.com/octo/${id}` }, 201);
    }
    const gist = /^\/gists\/([^/]+)$/.exec(path);
    if (gist && method === "PATCH") {
      const g = gists.get(gist[1]!);
      if (!g || pretend.gistsGone) return notFound();
      if (body["description"] !== undefined) g.description = String(body["description"]);
      for (const [k, v] of Object.entries(
        (body["files"] ?? {}) as Record<string, { content: string } | null>,
      ))
        if (v) g.files[k] = v.content;
        else delete g.files[k];
      return json({ id: gist[1], html_url: `https://gist.github.com/octo/${gist[1]}` });
    }

    const m = /^\/repos\/([^/]+\/[^/]+)(\/.*)?$/.exec(path);
    if (!m) return notFound();
    const repo = repos.get(m[1]!);
    if (!repo) return notFound();
    const rest = m[2] ?? "";

    if (rest === "" && method === "GET")
      return json({
        full_name: m[1],
        private: repo.private,
        default_branch: repo.defaultBranch,
        permissions: { push: repo.push },
      });
    if (rest === "/branches") return json([...repo.branches.keys()].map((name) => ({ name })));

    const ref = /^\/git\/ref\/heads\/(.+)$/.exec(rest);
    if (ref) {
      const sha = repo.branches.get(decodeURIComponent(ref[1]!));
      return sha ? json({ object: { sha } }) : notFound();
    }
    const commit = /^\/git\/commits\/([0-9a-f]+)$/.exec(rest);
    if (commit && method === "GET") {
      const c = repo.commits.get(commit[1]!);
      return c ? json({ sha: commit[1], tree: { sha: c.tree } }) : notFound();
    }
    const contents = /^\/contents\/(.+)$/.exec(rest);
    if (contents) {
      const file = fileAt(
        m[1]!,
        url.searchParams.get("ref") ?? repo.defaultBranch,
        contents[1]!.split("/").map(decodeURIComponent).join("/"),
      );
      return file ? json({ type: "file", sha: file.sha }) : notFound();
    }

    if (rest === "/git/blobs" && method === "POST") {
      const sha = hash40(`${body["encoding"]}:${body["content"]}`);
      repo.blobs.set(sha, { content: String(body["content"]), encoding: String(body["encoding"]) });
      return json({ sha }, 201);
    }
    if (rest === "/git/trees" && method === "POST") {
      const base = repo.trees.get(String(body["base_tree"]));
      if (!base) return json({ message: "Invalid base_tree" }, 422);
      const tree = new Map(base);
      for (const e of body["tree"] as { path: string; sha: string }[]) {
        if (!repo.blobs.has(e.sha)) return json({ message: "Invalid blob" }, 422);
        tree.set(e.path, e.sha);
      }
      const sha = hash40(JSON.stringify([...tree]));
      repo.trees.set(sha, tree);
      return json({ sha }, 201);
    }
    if (rest === "/git/commits" && method === "POST") {
      const sha = hash40(`c${++counter}:${body["tree"]}`);
      repo.commits.set(sha, {
        tree: String(body["tree"]),
        parents: body["parents"] as string[],
        message: String(body["message"]),
      });
      return json({ sha }, 201);
    }
    const head = /^\/git\/refs\/heads\/(.+)$/.exec(rest);
    if (head && method === "PATCH") {
      const name = decodeURIComponent(head[1]!);
      const current = repo.branches.get(name);
      const next = String(body["sha"]);
      if (!current) return notFound();
      // only a fast-forward: the new commit must be built on the branch's head
      if (!repo.commits.get(next)?.parents.includes(current))
        return json({ message: "Update is not a fast forward" }, 422);
      repo.branches.set(name, next);
      return json({ object: { sha: next } });
    }
    if (rest === "/git/refs" && method === "POST") {
      const name = String(body["ref"]).replace(/^refs\/heads\//, "");
      if (repo.branches.has(name)) return json({ message: "Reference already exists" }, 422);
      repo.branches.set(name, String(body["sha"]));
      return json({ ref: body["ref"] }, 201);
    }
    if (rest === "/pulls" && method === "POST") {
      const number = repo.pulls.length + 1;
      repo.pulls.push({
        title: String(body["title"]),
        head: String(body["head"]),
        base: String(body["base"]),
        body: String(body["body"] ?? ""),
        number,
      });
      return json({ number, html_url: `https://github.com/${m[1]}/pull/${number}` }, 201);
    }
    return notFound();
  };

  return {
    fetch: fetchFn,
    addRepo,
    fileAt,
    repos,
    gists,
    calls,
    pretend,
    /** Makes GitHub refuse the token from now on, as if it were revoked. */
    revoke: () => void (valid = false),
    /** Changes a file on a branch behind the writer's back, as a commit from someone else. */
    commitFile(name: string, branch: string, path: string, content: string) {
      const repo = repos.get(name)!;
      const parent = repo.branches.get(branch)!;
      const tree = new Map(repo.trees.get(repo.commits.get(parent)!.tree));
      const blob = hash40(`utf-8:${content}`);
      repo.blobs.set(blob, { content, encoding: "utf-8" });
      tree.set(path, blob);
      const treeSha = hash40(JSON.stringify([...tree]));
      repo.trees.set(treeSha, tree);
      const sha = hash40(`c${++counter}:${treeSha}`);
      repo.commits.set(sha, { tree: treeSha, parents: [parent], message: "someone else" });
      repo.branches.set(branch, sha);
    },
  };
}
