# decisions

Created: 2026-04-11

Load-bearing decisions for hbar.ink. Each decision is numbered, dated,
and stands until explicitly replaced by a later numbered decision.

---

## decision 001 — ink is a single-user thought-drop instrument

Date: 2026-04-11
Status: canonical

**The spine:**

> hbar.ink is a single-user thought-drop instrument. Its one job is to
> absorb compressed thoughts fast. Nothing more.

Three constraints that define it:

1. **Single-user.** One instance, one person. Not a service. Not a
   platform. Vim is not multi-user; ink is not multi-user. Anyone who
   wants their own ink runs their own instance.
2. **Drop-shaped.** The unit is a drop: a short chunk of text,
   timestamped, local to the browser. Drops are the authoritative
   artifact. Every derived thing (blog posts, exports, digests) is
   downstream of drops.
3. **Fast-in.** The single optimization target is the latency from
   "thought exists in the user's head" to "thought is written down
   and safely stored." Everything that makes this slower is wrong.
   Everything that does not affect this latency is optional.

## what attaches cleanly (does not change ink's identity)

- **Publish-to-blog pipeline.** A drop can graduate to an hbar.blog
  post. The drop stays the authoritative artifact; the post is a
  derived product. Ink's contract is unchanged: drops are still the
  unit. See decision 002 for the architecture.
- **Export to markdown.** A drop can be copied out as markdown. The
  drop is the source; the markdown is derived.
- **Optional annotation layers.** Anything that reads drops and adds
  commentary (the "secondary thoughts" branding idea) attaches
  downstream. Ink emits; other systems read.

## what belongs to a different system — do NOT add to ink

- **Multi-user writing** → `hbar.blog` or a future `hbar.write`. Ink
  is an instrument, not a service.
- **Brain integration** → `hbar.brain`'s job. The direction is "brain
  pulls from ink," not "ink pushes to brain." Ink does not know about
  brains. This keeps ink from needing to authenticate to any brain or
  care which brain owns which drops.
- **Federation / brains communicating** → `hbar.signals` or a future
  `hbar.federation`. Ink is a local surface, not a network protocol.
- **hbar1 hardware** → `hbar.brain`'s substrate, not ink's.

## why this decision exists

Before today, ink had no load-bearing constraint. Every time a new
idea surfaced in a session — brain integration, multi-user, federation,
branding film, secondary thoughts — ink absorbed it, because ink was
the closest unconstrained surface. The symptom was persistent
jumpiness: the user would re-define ink from scratch every few
sessions, each time contradicting the last definition. The diagnosis
was that ink was a vacuum, not a system.

This decision gives ink a spine. When a future session produces a new
idea that sounds like ink's job, check it against the three constraints
above. If it violates any of them, the idea belongs to a different
system, not ink.

---

## decision 002 — publish pipeline is option B (transform + deliver)

Date: 2026-04-11
Status: canonical, unbuilt

**The architecture:**

A single Vercel serverless function at `/api/publish`. Stateless. No
database. Three env vars, all server-side, none in the browser.

**Flow:**
1. Browser POSTs selected drops + a `x-publish-key` header to `/api/publish`.
2. Function checks the header against `PUBLISH_KEY`. Rejects if wrong.
3. Function calls Anthropic API (`ANTHROPIC_API_KEY`) with a prompt
   that formats the drops into `{ title, subtitle, body }` JSON in the
   hbar.ink lowercase one-sentence-per-line voice.
4. Function slugifies the title.
5. Function PUTs `writings/essays/{slug}/source.md` and `meta.json`
   to the `hbar.blog` repo via GitHub API (`GITHUB_TOKEN`, a
   fine-grained PAT scoped to Contents:write on that single repo).
6. Function returns `{ ok, slug, title, url }`.

**Why this shape:**

- **Stateless.** No database, no user table, no session management.
  Cannot pause or time out the way Supabase did, because there is
  nothing to pause.
- **Read path is untouched.** The hbar.blog site stays pure static
  HTML served by Vercel. If Anthropic or GitHub is down, publishing
  fails for that request, but the site never goes dark.
- **Write-gated, read-free.** This unlocks a clean move: remove the
  read gate from hbar.blog (everyone can read), keep the write gate
  on /api/publish (only the user can publish). Different gates for
  different actions is the right shape.
- **Draft by default.** Published posts land with `status: "draft"`
  in meta.json, so a Claude output with bad frontmatter cannot break
  the site render before the user reviews it.

**Three env vars (all Vercel, all server-side):**
- `ANTHROPIC_API_KEY` — existing.
- `GITHUB_TOKEN` — new fine-grained PAT, scoped to only the hbar.blog
  repo, Contents:write only. Rotate-able.
- `PUBLISH_KEY` — any string the user picks. Not a real secret; a
  rate-limiter against random visitors spamming the endpoint. Stored
  in the user's browser localStorage on first use.

**Failure modes and what they mean:**
- Claude returns malformed JSON → 502, user retries.
- GitHub token expired → 502, user rotates in Vercel, no code change.
- Claude output has bad frontmatter → commit lands but page 404s.
  Mitigated by status:draft default.
- PUBLISH_KEY leaks → bounded damage, git history makes it reversible,
  rotate the env var.

**Not in scope for this version:**
- Cross-device sync of drops. Drops stay per-browser.
- Editing or deleting a published post from ink. Edit via git.
- Multi-author pipelines. See decision 001: ink is single-user.
