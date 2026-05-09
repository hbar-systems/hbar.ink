// hbar.ink — publish pipeline (decision 002)
//
// Takes selected drops from the browser, asks Claude to format them
// as a short blog post, commits source.md + meta.json to the hbar.blog
// repo via GitHub API. Stateless. No database. Cannot go dark the way
// Supabase did because there is nothing to pause.
//
// Env vars required at runtime (all server-side, never shipped to browser):
//   - PUBLISH_KEY       : any string the user picks; acts as a write gate
//   - ANTHROPIC_API_KEY : Claude API key
//   - GITHUB_TOKEN      : fine-grained PAT, Contents:write on the blog repo
//   - GITHUB_REPO       : owner/repo, e.g. "yuryuri/hbar.blog"
//   - GITHUB_BRANCH     : optional, defaults to "main"
//   - GITHUB_ESSAYS_PATH: optional, defaults to "writings/essays"

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface IncomingDrop {
  id?: string
  text: string
  created?: string
}

interface PublishRequestBody {
  drops: IncomingDrop[]
}

interface ClaudePost {
  title: string
  subtitle: string
  body: string
}

const SYSTEM_PROMPT = `You are the editorial engine for hbar.blog. You receive a set of compressed thought-drops from hbar.ink and produce a short blog post.

Voice rules (these are strict):
- lowercase throughout
- one sentence per line (no paragraphs, each sentence gets its own line with a blank line between groups if the thought changes)
- no ornament, no marketing, no filler
- no headings inside the body beyond paragraph breaks
- the thought is the artifact; do not invent material not present in the drops

Output ONLY valid JSON with this exact shape and nothing else (no markdown fences, no prose, no preamble):
{
  "title": "lowercase title, 3-8 words",
  "subtitle": "optional one-line subtitle, may be an empty string",
  "body": "markdown body, one sentence per line, no heading at top"
}`

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
}

function stripFences(raw: string): string {
  return raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function buildSourceMd(post: ClaudePost, created: string): string {
  const subtitleLine = post.subtitle ? `## ${post.subtitle}\n\n` : ''
  return `# ${post.title}\n${subtitleLine}Created: ${created}\n\n---\n\n${post.body}\n`
}

function buildMeta(post: ClaudePost, slug: string, created: string, dropCount: number) {
  return {
    id: slug,
    slug,
    title: post.title,
    subtitle: post.subtitle || '',
    description: post.subtitle || post.title,
    status: 'draft',
    type: 'essay',
    cognitive_layer: 'drop',
    series: [],
    project: ['hbar.ink', 'hbar.blog'],
    tags: ['hbar.ink', 'thought-drop'],
    created,
    updated: created,
    source: { has_markdown: true, primary: 'source.md' },
    exports: [],
    notes: `published from hbar.ink via /api/publish, ${dropCount} drops`,
  }
}

async function putGithubFile(
  repo: string,
  branch: string,
  path: string,
  content: string,
  message: string,
  token: string,
): Promise<{ ok: true } | { ok: false; status: number; detail: string }> {
  const url = `https://api.github.com/repos/${repo}/contents/${path}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/vnd.github+json',
      'user-agent': 'hbar.ink-publish',
    },
    body: JSON.stringify({
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
      branch,
    }),
  })
  if (!res.ok) {
    const detail = await res.text()
    return { ok: false, status: res.status, detail }
  }
  return { ok: true }
}

export async function POST(req: NextRequest) {
  const publishKey = process.env.PUBLISH_KEY
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  const githubToken = process.env.GITHUB_TOKEN
  const githubRepo = process.env.GITHUB_REPO
  const githubBranch = process.env.GITHUB_BRANCH || 'main'
  const essaysPath = process.env.GITHUB_ESSAYS_PATH || 'writings/essays'

  if (!publishKey || !anthropicKey || !githubToken || !githubRepo) {
    return NextResponse.json(
      { error: 'server not configured', missing: ['PUBLISH_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN', 'GITHUB_REPO'].filter(k => !process.env[k]) },
      { status: 500 },
    )
  }

  // 1. gate
  const provided = req.headers.get('x-publish-key')
  if (provided !== publishKey) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  // 2. parse body
  let body: PublishRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json body' }, { status: 400 })
  }
  if (!body?.drops || !Array.isArray(body.drops) || body.drops.length === 0) {
    return NextResponse.json({ error: 'no drops in body' }, { status: 400 })
  }
  const cleanDrops = body.drops
    .map(d => ({ text: typeof d?.text === 'string' ? d.text.trim() : '' }))
    .filter(d => d.text.length > 0)
  if (cleanDrops.length === 0) {
    return NextResponse.json({ error: 'drops empty after trim' }, { status: 400 })
  }

  // 3. call claude
  const userPrompt = `Drops:\n\n${cleanDrops.map(d => `- ${d.text}`).join('\n')}`

  let anthropicRes: Response
  try {
    anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'anthropic fetch failed', detail: String(e?.message || e) }, { status: 502 })
  }
  if (!anthropicRes.ok) {
    const detail = await anthropicRes.text()
    return NextResponse.json({ error: 'anthropic api error', status: anthropicRes.status, detail }, { status: 502 })
  }
  const anthropicJson: any = await anthropicRes.json()
  const raw: string = anthropicJson?.content?.[0]?.text ?? ''
  if (!raw) {
    return NextResponse.json({ error: 'anthropic returned empty text' }, { status: 502 })
  }

  // 4. parse claude's json
  let post: ClaudePost
  try {
    const cleaned = stripFences(raw)
    const parsed = JSON.parse(cleaned)
    if (!parsed || typeof parsed.title !== 'string' || typeof parsed.body !== 'string') {
      throw new Error('missing fields')
    }
    post = {
      title: parsed.title.trim(),
      subtitle: typeof parsed.subtitle === 'string' ? parsed.subtitle.trim() : '',
      body: parsed.body.trim(),
    }
  } catch (e: any) {
    return NextResponse.json({ error: 'claude returned unparseable json', raw, detail: String(e?.message || e) }, { status: 502 })
  }

  // 5. slug + dates
  const slug = slugify(post.title)
  if (!slug) {
    return NextResponse.json({ error: 'empty slug after slugify', title: post.title }, { status: 502 })
  }
  const created = new Date().toISOString().slice(0, 10)

  // 6. build files
  const sourceMd = buildSourceMd(post, created)
  const meta = buildMeta(post, slug, created, cleanDrops.length)
  const metaJson = JSON.stringify(meta, null, 2) + '\n'

  // 7. commit to github
  const basePath = `${essaysPath}/${slug}`
  const commitMessage = `post(hbar.ink): ${post.title}`

  const sourceRes = await putGithubFile(
    githubRepo,
    githubBranch,
    `${basePath}/source.md`,
    sourceMd,
    commitMessage,
    githubToken,
  )
  if (!sourceRes.ok) {
    return NextResponse.json(
      { error: 'github commit failed (source.md)', status: sourceRes.status, detail: sourceRes.detail },
      { status: 502 },
    )
  }

  const metaRes = await putGithubFile(
    githubRepo,
    githubBranch,
    `${basePath}/meta.json`,
    metaJson,
    `${commitMessage} — meta`,
    githubToken,
  )
  if (!metaRes.ok) {
    return NextResponse.json(
      {
        error: 'github commit failed (meta.json) — source.md landed but meta did not; a manual fix or retry is needed',
        status: metaRes.status,
        detail: metaRes.detail,
        slug,
      },
      { status: 502 },
    )
  }

  // 8. done
  return NextResponse.json({
    ok: true,
    slug,
    title: post.title,
    subtitle: post.subtitle,
    drops: cleanDrops.length,
    url: `https://hbar.blog/essays/${slug}`,
  })
}
