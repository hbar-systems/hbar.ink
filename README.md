# hbar.ink

**A sovereign writing instrument for structured cognition.**

hbar.ink is not a "notes app" and not a feature race.  
It is a minimalist, private-by-design writing surface — an instrument layer  
architecturally ready for future intelligence integration, but fully usable today.

## Status

**Phase 1 — The Instrument (v0.2)**  
Current goal: if this were perfectly stable tomorrow, would you use it every day?

This repo focuses on:
- intentional typography
- true focus mode
- stable navigation and editing
- sealing semantics (content + metadata lock)

## Core Principles

- **Minimalist thinking surface:** structured but invisible.
- **Beautiful but restrained:** typographic personality without clutter.
- **Private by design:** no background "AI reading."
- **Deterministic behavior:** no surprise navigation, no state lies.
- **Future-ready:** clear seams for later intelligence layers (v2+).

## Current Features

### Writing & Editing
- **Clean editor surface** with no distractions
- **Markdown-first** content storage (plain text, future-proof)
- **Autosave with honest status:** Saving... / Saved / Error (never lies)
- **Instant title rename** with debounced persistence
- **Preview mode** with Markdown rendering
- **Export to Markdown** (.md file download)

### Modes & Typography
- **2 Style Presets:**
  - **Writer's Room** — Light mode for drafting (#f6f5f2 background)
  - **Night Ink** — Dark mode for immersion (#1a1a1a background)
- **4 Font Choices:** Quicksand, Montserrat, Audiowide, Spectral (per-document override)
- **3 Width Options:** Narrow (680px), Comfort (820px), Wide (1100px)

### Focus Mode
- **True full-screen writing** — sidebar hidden by default
- **Edge-hover reveal** — move mouse to left edge (12px) to show sidebar
- **Cmd/Ctrl+B** — keyboard toggle for sidebar
- **Header fades** — top bar disappears, reappears on hover
- **No layout shift** — clean transitions

### Organization
- **Pinned documents** — pin important docs to top of sidebar (localStorage)
- **Saved views** — quick filters (All / Notes / Prompts)
- **Document metadata:**
  - System: personal, hbar.science, hbar.blog, hbar.brain, hbar.economy
  - Kind: note, essay, paper_section, plan, meeting, prompt, spec, log, archive
  - Status: draft, active, terminal (sealed)
  - AI Policy: deny, allow_rag_only, allow

### Navigation
- **Cmd+K document switcher** — fast search and jump
- **Deterministic Back button** — always goes to /app (never browser history)
- **Cmd+S** — manual save trigger
- **Cmd+\\** — toggle focus mode
- **Esc** — exit focus mode or close switcher

## Sealing Semantics (Important)

**Sealing is a hard lock.**

When a document is **sealed** (status = terminal):
- **Content is immutable** — no edits allowed
- **Metadata is immutable** — title, mode, font, width frozen
- **Editing UI disabled** — textarea becomes read-only
- **Server rejects writes** — database-level protection via RLS
- **"Duplicate to Edit" option** — creates new draft copy

### Why Sealing Matters

Sealed documents become **artifacts** — stable references you can cite, link to, and trust won't change.  
This is foundational for Phase 4 (cognitive system) where sealed documents gain permanence.

### AI Policy Enforcement

AI policy is **server-side enforced**:
- "Send to Brain" (if present) only reads when:
  1. Policy allows (`allow` or `allow_rag_only`)
  2. User explicitly triggers the action
- **No background reading** — no silent indexing or ingestion
- **Private by default** — `deny` is the default policy

## Storage & Data

### What Gets Saved

**Supabase PostgreSQL database:**
- Document content (Markdown plain text)
- Title, metadata (system, kind, status, AI policy)
- Style preferences (preset, font override)
- Timestamps (created_at, updated_at)
- Owner ID (linked to Supabase Auth user)

**localStorage (browser only):**
- Editor width preference (narrow/comfort/wide)
- Font override selection
- Focus mode state (on/off)
- Pinned document IDs
- Saved view filters

### Data Ownership

- **You own your content** — all documents belong to your user account
- **Row Level Security** — only you can read/write your documents
- **Export anytime** — download as Markdown files
- **Delete anytime** — account deletion removes all your data
- **No AI training** — your content is never used to train models
- **No analytics** — we don't track what you write

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, TailwindCSS
- **Backend**: Supabase (PostgreSQL + Auth + RLS)
- **Fonts**: Google Fonts via next/font (Quicksand, Montserrat, Audiowide, Spectral)
- **Editor**: Native textarea (preserves browser undo/redo)
- **Styling**: Tailwind + CSS variables for minimal theming

## Quick Start

The easiest way to get started is to use our setup script:

```bash
# Clone the repository
git clone <repository-url>
cd hbar.ink

# Install dependencies
npm install

# Run the setup script
node setup.js
```

## Manual Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd hbar.ink
npm install
```

### 2. Configure Supabase

1. Create a new project at [https://supabase.com](https://supabase.com)
2. Get your project URL and anon key from the API settings
3. Create `.env.local` with your credentials:

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

### 3. Set Up Database Schema

1. Navigate to the SQL Editor in your Supabase dashboard
2. Copy the contents of `supabase/schema.sql`
3. Paste and execute in the SQL Editor

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see your app.

## Routes

- `/` — Landing page with "Enter" button
- `/about` — What hbar.ink is (instrument philosophy)
- `/legal` — Privacy + Terms (minimal but complete)
- `/login` — Authentication (Supabase Auth)
- `/app` — Document list (home, with pinned + views)
- `/doc/[id]` — Editor (pure writing surface, no header/footer)

**Back button behavior:** Always navigates to `/app` (deterministic, never uses browser history)

## Document Organization

Documents follow a simple workflow:

- **Inbox** (status=draft): Where new ideas and drafts begin
- **Active** (status=active): Documents you're actively working on
- **Terminal** (status=terminal): Completed documents ready for reference

Additional metadata helps with organization:

- **System**: personal, hbar.science, hbar.blog, hbar.brain, hbar.economy
- **Source Kind**: note, essay, paper_section, plan, meeting, prompt, spec, log, archive, dataset_card
- **AI Policy**: deny, allow_rag_only, allow (controls Brain integration)

## Roadmap: Where hbar.ink Can Actually Go

Not features. **Trajectory.**

### Phase 1 – Instrument (now)
**Status:** Frozen and stable  
- Beautiful, minimal, daily-usable
- No conceptual weight
- Focus on instrument quality

### Phase 2 – Structured Intelligence Layer
Documents gain invisible structure:
- `type`: draft / essay / note / research
- Semantic blocks
- AI-aware metadata
- Still feels minimal

### Phase 3 – Thinking Amplifier
AI integration that:
- Reorganizes arguments
- Suggests structure
- Detects repetition
- Connects related documents
- Creates cognitive graph silently
- Still not noisy

### Phase 4 – Sovereign Cognitive System
**Sealing matters here.**
- Documents become artifacts
- Brain integration reads only when allowed
- This becomes a thinking laboratory
- Policy-gated intelligence
- Permanent, citable references

## Keyboard Shortcuts

- **Cmd+K** — Open document switcher
- **Cmd+S** — Force save document
- **Cmd+\\** — Toggle focus mode
- **Cmd+B** — Toggle sidebar (in focus mode)
- **Esc** — Close document switcher / Exit focus mode

## Deployment

hbar.ink can be deployed to Vercel or Netlify:

```bash
# Vercel
vercel

# Netlify
netlify deploy
```

Configuration files for both platforms are included.

## Data Model

The application uses a single `documents` table with Row Level Security:

| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| owner_id | uuid | Foreign key to auth.users |
| title | text | Document title |
| content_md | text | Markdown content |
| system | text | Categorization system |
| source_kind | text | Type of document |
| status | text | draft, active, or terminal |
| tags | text[] | Array of tags |
| ai_policy | text | Brain integration permissions |
| style_preset | text | Selected writing style |
| pin_rank | int | Optional sorting priority |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

## Folder Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Landing page
│   ├── about/             # About page
│   ├── legal/             # Legal page
│   ├── login/             # Auth page
│   ├── app/               # Document list
│   └── doc/[id]/          # Editor
├── components/
│   ├── layout/            # Sidebar, focus mode wrapper
│   └── ui/                # Toast, shared components
├── types/                 # TypeScript definitions
└── lib/                   # Utilities

```

## Contributing

This repo is **intentionally minimalist**.

**Phase 1 is frozen** — no new features unless required for stability.

If contributing:
- No abstractions for future features
- No "just in case" code
- Stability > features
- Minimal > clever

## License

TBD (currently private/personal use)
