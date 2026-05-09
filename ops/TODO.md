# TODO

Created: 2026-04-10

Pending work for hbar.ink. See ops/README.md for conventions.

---

## supabase rip — done 2026-04-10

The site was going down whenever Supabase paused the free tier. All
Supabase code has been removed. hbar.ink is now a localStorage-only
Thought Drop surface with no server dependencies.

**Last pre-rip commit:** `ee02f86 fix: new notes disappearing on creation`
Use `git checkout ee02f86 -- <path>` or `git worktree add ../hbar.ink-presupabase ee02f86` to resurrect any removed file as reference. Do not resurrect blindly — the right way back into Supabase (if ever) is to read the old commit as reference and reimplement against current deps.

Removed: `src/middleware.ts`, `src/lib/supabase.ts`, `src/lib/document.ts`, `src/lib/file-utils.ts`, `src/lib/utils.ts`, `src/types/document.ts`, `src/components/cmd-k.tsx`, `src/components/ui/toast.tsx`, `src/components/layout/sidebar-layout.tsx`, `src/components/layout/focus-mode-wrapper.tsx`, and directories `src/app/auth`, `src/app/login`, `src/app/app`, `src/app/doc`, `src/app/api`.

Deps removed from `package.json`: `@supabase/auth-helpers-nextjs`, `@supabase/supabase-js`.

Copy updated: `/about` and `/legal` no longer mention Supabase.

Build verified: `npm run build` clean, 7 static routes, 2.01 kB for `/`.

## thought drop — v0

- [ ] Browser test: open `npm run dev`, verify Cmd+Enter drops, publish toggle persists across reload, remove works, copy-md puts a markdown-formatted quote on the clipboard. Build was verified but UI was not, per the "test UI in browser" rule. [2026-04-10]
- [ ] Decide whether drops need a hard cap (e.g. 500) with oldest-rotation, or stay unbounded until localStorage quota is an actual problem. Currently unbounded. [2026-04-10]
- [ ] Decide whether to add an "export all as .md" button (one bundled markdown file of the full stack). Useful the first time you want to migrate drops somewhere durable. [2026-04-10]

## publish-to-blog pipeline — decided + wired 2026-04-11

Decision 002 in `ops/decisions.md`: option B (transform + deliver).
Single Vercel serverless function at `/api/publish` that calls Claude
to format drops and commits source.md + meta.json to the hbar.blog
repo via GitHub API. Stateless. No database.

**Code landed:**
- `src/app/api/publish/route.ts` — the function (~220 lines incl. error handling)
- `src/app/page.tsx` — "publish selected" button, publish-key settings, result banner
- Build verified: `npm run build` clean, `/api/publish` registered as dynamic route

**Still required before it works in production:**
- [ ] Set four Vercel env vars on the hbar.ink project: `PUBLISH_KEY` (any string), `ANTHROPIC_API_KEY`, `GITHUB_TOKEN` (fine-grained PAT scoped to `yuryuri/hbar.blog` with Contents:write only), `GITHUB_REPO` (e.g. `yuryuri/hbar.blog`). Optional: `GITHUB_BRANCH`, `GITHUB_ESSAYS_PATH`. [2026-04-11]
- [ ] After deploy: open ink, click "key" in the header, paste the same `PUBLISH_KEY` value. Stored in localStorage. [2026-04-11]
- [ ] First smoke test: flag one drop for publish, click "publish selected →", verify a draft post lands in `writings/essays/<slug>/` on hbar.blog main branch. [2026-04-11]
- [ ] After smoke test passes: remove the read gate from hbar.blog (task #3), keep the write gate on ink. Different gates for different actions. [2026-04-11]

**Resolved tension with the `ideas.md` daily-digest entry:**
Per-drop / batch publish is the primary path. The "daily digest"
framing can live as an alternative prompt shape — the same
`/api/publish` function could accept a different mode flag later if
we want to bundle all of yesterday's drops into one post. Not built,
not urgent.

## ink.hbar.systems alias — not done

- [ ] Add `ink.hbar.systems` as a Vercel domain alias on the hbar.ink project and create the DNS CNAME. Logged in `ops/ideas.md` under `# hbar.systems (registry)`. [2026-04-10]

## nextjs upgrade — flagged only

- [ ] `next@14.1.0` has a published CVE (nextjs.org/blog/security-update-2025-12-11). Upgrade is its own decision, not part of the Supabase rip. Do not bundle with other work. [2026-04-10]
