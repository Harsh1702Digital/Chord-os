# ChordOS — Knowledge Transfer Document

**App name in code:** `harmony`  
**Production URL:** `https://chord-os.theampmworld.com`  
**Stack:** Next.js 15 App Router · TypeScript · Supabase · Anthropic Claude · Tailwind v4  
**Slack workspace:** `edernityteam.slack.com` · `#chord-os`  
**Last updated:** 2026-09-28

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Accounts & Access](#2-accounts--access)
3. [Local Setup](#3-local-setup)
4. [Architecture Overview](#4-architecture-overview)
5. [App Routes](#5-app-routes)
6. [API Routes](#6-api-routes)
7. [Database Schema](#7-database-schema)
8. [AI Integration](#8-ai-integration)
9. [Auth Flow](#9-auth-flow)
10. [Key Business Logic](#10-key-business-logic)
11. [Components](#11-components)
12. [Lib Utilities](#12-lib-utilities)
13. [Environment Variables](#13-environment-variables)
14. [SQL Files — Full Inventory](#14-sql-files--full-inventory)
15. [Deployment](#15-deployment)
16. [Critical Gotchas](#16-critical-gotchas)

---

## 1. What This Is

ChordOS is the internal operations platform for **Chord / 1702 Digital** — a 19-person digital marketing agency. It replaces spreadsheets + WhatsApp + memory as the system of record for:

- **Task allocation** — AI-powered chat allocator for team leads
- **Brand knowledge** — accumulating per-brand rules, decisions, and contacts from every client meeting
- **Calendar & blocks** — team-wide weekly schedule with conflict detection
- **Harmony Core** — monthly delivery tracker per person per brand
- **HR** — leaves, feedback, team directory
- **Client portal** — separate login for clients to view deliverables and performance

The product has two separate user flows with separate auth:
- **Internal staff** → Slack OAuth → `/dashboard`, `/tasks`, `/calendar`, etc.
- **Clients** → email/password → `/client/...` (scoped to their brand only)

---

## 2. Accounts & Access

From `docs/accounts.md`:

| Service | Account | Notes |
|---|---|---|
| **Vercel** | vivekpraja007@gmail.com | Hosts both prod + staging |
| **Supabase (prod)** | hi@ampmnetwork.com | RLS enabled, `main` branch |
| **Supabase (staging)** | vivek.prajapati@1702digital.com | Separate project, RLS disabled |
| **Slack OAuth** | vivek.prajapati@1702digital.com | `edernityteam` workspace |
| **Google Calendar** | vivek.prajapati@1702digital.com | Calendar integration |
| **GitHub** | vivek.prajapati@1702digital.com | Repo owner |
| **Google Cloud Console** | — | Add when Sheets API key is created |
| **cronjob.org** | Not set up yet | Needed for delay-check cron in prod |

---

## 3. Local Setup

```bash
npm install
# create .env.local (see Section 13 for all vars)
npm run dev   # http://localhost:3000
```

**DB setup** (run in Supabase SQL Editor in this order):
1. `SQL/schema.sql` — NOTE: this file is currently empty. Schema was set up directly in prod Supabase. Reconstruct from patch files below.
2. `SQL/rls-patch.sql` — MUST RUN or all queries return empty
3. `SQL/meeting-schema.sql`
4. `SQL/access-tier.sql`
5. `SQL/features-patch.sql`
6. `SQL/leaves.sql` + `SQL/leaves_add_approver.sql`
7. `SQL/feedback.sql` + `SQL/feedback_add_rating.sql`
8. `SQL/client-portal-patch.sql`
9. `SQL/brand-documents-patch.sql`
10. `SQL/operations-patch.sql` + `SQL/operations-links-patch.sql`
11. `SQL/activity-logs.sql`
12. `SQL/add_hr_tier.sql`
13. `SQL/seed.sql` — loads 20 people + 4 brands + demo tasks

**Type check:**
```bash
npx tsc --noEmit
npm run build
```

---

## 4. Architecture Overview

```
Browser (Staff)              Browser (Client)
      |                            |
      | Slack OAuth                | Email/Password
      ↓                            ↓
  /api/auth/callback        /client/* routes
      |                            |
      ↓                            ↓
     middleware.ts (route guard — checks Supabase session, client_accounts.is_active)
      |
      ↓
 Next.js App Router (Vercel — bom1 Mumbai)
      |
      ├── Server Components → Supabase (server client, respects RLS)
      ├── Client Components → Supabase (browser client)
      ├── /api/chat         → Anthropic Claude Sonnet → Groq → Gemini (fallback chain)
      ├── /api/brands/meeting → Claude Haiku → Groq → Gemini (extraction)
      ├── /api/slack/notify → Slack Webhook (edernityteam #chord-os)
      ├── /api/calendar/google-events → Google Calendar API
      ├── /api/cron/*       → runs on cron-job.org schedule
      └── /api/admin-brain/sheet → Google Sheets (CSV)
              |
              ↓
        Supabase Postgres (22 tables · RLS · Realtime)
```

**Two Supabase clients — know when to use which:**
- `createBrowserClient()` — React client components, browser event handlers
- `createServerClient()` — Server components, API route handlers. Respects RLS using user session.
- `createAdminClient()` (service role) — bypasses RLS. Used ONLY for: auth callback user linking, meeting confirm cross-user writes, client account creation. Never expose to browser.

---

## 5. App Routes

### Internal App `app/(app)/`

Layout (`app/(app)/layout.tsx`) handles: session gate → redirect to `/login`, fetches `people` row, renders sidebar. Access tier is injected into all nav components.

| Route | Purpose | Access |
|---|---|---|
| `/dashboard` | Today's blocks, in-progress tasks, review queue, stat cards | Any auth |
| `/tasks` | Filterable task list. Staff see own only. | Any auth (scoped by tier) |
| `/calendar` | Week grid 08:00–22:00, block chips, flexible task chips, Google Calendar overlay | Any auth; person switcher for admin/lead/ops |
| `/chat` | AI Allocator — natural language task assignment | admin + lead only |
| `/briefings` | Chronological feed of all brand meetings | Any auth |
| `/brands` | Brand grid | Any auth |
| `/brands/[slug]` | Brand detail: identity, voice, brain (rules/contacts), documents, tasks, NPS | Any auth |
| `/brands/[slug]/meeting` | Log meeting → AI extract → confirm → save | admin + lead only |
| `/brands/[slug]/nps` | NPS form management | admin only |
| `/analytics` | On-time rate, completion stats, hours | Any auth (staff = own) |
| `/team` | People directory; admin can edit | Any auth |
| `/profile` | Own profile edit + Google Calendar connect | Any auth |
| `/hr` | HR module home | admin + hr |
| `/hr/leaves` | Leave requests + approvals | admin + hr |
| `/hr/feedback` | Feedback submission + review | admin + hr |
| `/harmony-core` | Monthly delivery tracker | admin + lead + ops |
| `/operations` | Internal links pinboard | Any auth; write = admin |
| `/admin-brain` | Google Sheets backlog viewer | admin only |

### Client Portal `app/client/(portal)/`

Separate layout, separate auth, email/password login. Clients only see their brand.

| Route | Purpose |
|---|---|
| `/client/login` | Email/password login |
| `/client` | Dashboard with brand performance charts |
| `/client/files` | Delivered files |
| `/client/brand` | Brand overview |
| `/client/brand-files` | Categorised brand files |

### Public Routes

| Route | Purpose |
|---|---|
| `app/(auth)/login` | Slack OAuth sign-in page |
| `app/demo/**` | Public demo (no auth, mock data from `lib/mock-data.ts`) |

---

## 6. API Routes

### Auth

| Route | Method | What it does |
|---|---|---|
| `/api/auth/callback` | GET | Slack OAuth callback. Exchanges code → session. Uses admin client to link/create `people` row. |
| `/api/auth/logout` | POST | Signs out Supabase session. |
| `/api/auth/google` | GET | Initiates Google OAuth (scopes: calendar.events + forms.responses.readonly). |
| `/api/auth/google/callback` | GET | Stores `refresh_token` on `people` row, sets `google_calendar_connected = true`. |
| `/api/auth/google/disconnect` | POST | Clears `google_refresh_token`, sets `google_calendar_connected = false`. |
| `/api/client/auth/logout` | POST | Client portal logout. |

### Tasks

| Route | Method | Key behaviour |
|---|---|---|
| `/api/tasks` | POST | Creates task + optional block. P0 conflict gate (409 with `warning: true`). Recurrence support (weekdays/daily/weekly/custom, max 60 occurrences). Conflict checks on blocks. Notifies Slack. Logs to `activity_logs`. |
| `/api/tasks/[id]` | PATCH | Updates task + block. Re-checks conflicts. Notifies Slack. |
| `/api/tasks/[id]` | DELETE | Deletes task. Logs activity. |
| `/api/tasks/[id]/reassign` | POST | Reassigns owner. admin/lead only. Notifies Slack. |

### Brands

| Route | Method | Key behaviour |
|---|---|---|
| `/api/brands/create` | POST | Creates brand. admin/lead only. |
| `/api/brands/update` | POST | Updates brand. admin/lead only. |
| `/api/brands/meeting` | POST | Two-phase: `extract` (AI → JSON preview) then `confirm` (saves meeting, creates tasks, merges knowledge into `brands.knowledge` JSONB). Uses admin client on confirm. |

### AI Chat

| Route | Method | Key behaviour |
|---|---|---|
| `/api/chat` | POST | AI Allocator. 403 for non-admin/lead. Builds context from brands + knowledge + team capacity + recent 60d meetings. Runs agentic loop (max 20 iterations). Tools: `create_task_and_block`, `reassign_task`. Primary: Claude Sonnet → Groq llama-3.3-70b → Gemini 2.5-flash. System prompt cached with `cache_control: ephemeral`. |
| `/api/chat/transcribe` | POST | Transcribes voice input to text. |

### Harmony Core

| Route | Notes |
|---|---|
| `/api/harmony-core` GET | Auto-carries over unfinished social scope from prior month on read. Calls `get_harmony_assignments` RPC. |
| `/api/harmony-core` POST | Upserts `harmony_core_monthly`. Notifies `HARMONY_CORE_WEBHOOK_URL`. |
| `/api/harmony-core/assignments`, `/weekly`, `/history`, `/carry-over` | Supporting endpoints for tracker. |

### HR

| Route | Method | Notes |
|---|---|---|
| `/api/leaves` | POST | Creates leave request. Requires `approver_id`. Admin client. |
| `/api/leaves/[id]` | PATCH | Approve/reject. admin/hr only. |
| `/api/feedback` | POST | Creates feedback. admin/hr only. Status auto-set to `published`. |

### Cron (all require `Authorization: Bearer CRON_SECRET`)

| Route | Schedule | What it does |
|---|---|---|
| `/api/cron/delay-check` | 03:30 UTC (09:00 IST) daily | Finds overdue tasks. Sends "Due in 24h" Slack alerts for tasks due in next 24h. |
| `/api/cron/ops-reminder` | 05:00 UTC (10:30 IST) daily | Sends "time to assign today's tasks" Slack message. |

### Other

| Route | Notes |
|---|---|
| `/api/slack/notify` | Central Slack dispatcher. Routes by `type` field. 12+ notification types. |
| `/api/calendar/google-events` | Fetches authed user's GCal events. Returns `token_expired: true` on 401. |
| `/api/admin-brain/sheet` | admin only. Reads backlog Google Sheet (URL from `app_settings`). |
| `/api/admin/client-accounts` | POST: creates Supabase auth user + `client_accounts` row via `insert_client_account` RPC. admin/ops only. |
| `/api/people/me` | Returns authed user's `people` row. |
| `/api/capacity` | Team capacity data. |
| `/api/operations` | Reads/writes `ops_links`. Write = admin. |
| `/api/nps-forms` | NPS form CRUD. |
| `/api/settings` | `app_settings` CRUD. Write = admin. |
| `/api/logs` | Returns `activity_logs`. |

---

## 7. Database Schema

### Core Tables

**`people`** — the team directory. Every person who can log in must have a row here.
- `id` uuid PK
- `auth_user_id` uuid → `auth.users.id` (null until first Slack login)
- `name`, `email` (UNIQUE), `role`, `department`, `seniority`, `location`
- `is_team_lead` boolean (legacy — access tier is the source of truth now)
- `access_tier` text: `admin|lead|operations|hr|poc|staff|viewer` (default: `staff`)
- `harmony_core_enabled` boolean
- `google_refresh_token` text (nullable — set when user connects Google Calendar)
- `google_calendar_connected` boolean

**`brands`** — client brands
- `id`, `slug` (UNIQUE), `name`, `category`, `tier` (`tier-1`/`tier-2`), `status` (`active`/`inactive`)
- `account_lead_id` → `people.id`
- `typography` jsonb, `colors` jsonb, `voice_summary` text
- `knowledge` jsonb: `{rules: [{rule, category, meeting_id, date}], rejections: [], approvals: [], contacts: [{name, role}]}`

**`tasks`**
- `id`, `brand_id`, `deliverable`, `task_type` (copy/design/video/seo/content/strategy/other)
- `owner_id`, `reviewer_id`, `assigned_by_id` → `people.id`
- `priority` text: `P0|P1|P2`
- `status` text: `scheduled|in_progress|review|rework|approved|done|cancelled`
- `estimated_hours`, `start_date`, `deadline` timestamptz
- `notes`, `brief`, `meeting_id`
- `flexible` boolean — flexible tasks have no block; shown as chips above calendar
- `acknowledged_at`, `submission_link`, `submitted_at`, `on_time` boolean
- `revision_round` int (default 0), `delay_count` int (default 0)

**`blocks`** — calendar time slots, each linked to one task
- `id`, `task_id` → `tasks.id`, `person_id` → `people.id`
- `start_at`, `end_at` timestamptz (UTC stored, IST displayed)
- `status` text: `scheduled|in_progress|done|cancelled`
- `actual_hours`

**`task_references`** — mood boards, Figma links, storyboards per task
- `task_id`, `ref_type` (figma/miro/reference), `url`

**`brand_meetings`** — AI-extracted meeting records
- `brand_id`, `logged_by_id`, `meeting_date`, `raw_notes`
- `ai_summary`, `decisions` jsonb, `tasks_suggested` jsonb, `knowledge_delta` jsonb
- `tasks_confirmed` boolean

**`leaves`** — leave requests
- `person_id`, `type` (planned/urgent/birthday), `start_date`, `end_date`
- `duration_days` (generated: end - start + 1)
- `status` (pending/approved/rejected), `approved_by`, `approver_id`

**`leave_balances`** — per person per year
- `planned_total` (12), `urgent_total` (8), `birthday_total` (1)

**`feedback`** — HR feedback per employee
- `person_id` (reviewed), `submitted_by`, `period`, `content`, `rating`, `status`

**`client_accounts`** — client portal users
- `auth_user_id` → `auth.users.id`, `email` UNIQUE, `brand_id` → `brands.id`
- `is_active` boolean, `created_by_person_id`

**`brand_documents`** — files uploaded per brand (Supabase Storage: `briefings/{brand-slug}/`)
- `brand_id`, `name`, `file_path`, `file_type`, `file_size`, `uploaded_by_id`

**`app_settings`** — key/value store (keys: `ops_embed_url`, `backlog_sheet_url`)

**`ops_links`** — internal links pinboard
- `title`, `url`, `sort_order`, `added_by_id`

**`harmony_core_monthly`** — monthly delivery tracker
- `person_id`, `brand_id`, `month` (YYYY-MM-01)
- `role_type`, `metrics` jsonb, `tracker_logs` jsonb
- UNIQUE on `(person_id, brand_id, month)`

**`activity_log`** — written by chat route + task API (has `actor_id` UUID FK)

**`activity_logs`** — written by `lib/activity.ts` (has `actor_name` text, `actor_email` text)

> ⚠️ Two separate activity tables exist. Not consolidated. Different routes write to different ones.

### Views

**`member_stats`** (from `features-patch.sql`) — aggregated task stats per person:
- `total_tasks`, `completed_tasks`, `on_time_count`, `late_count`, `total_delays`, `on_time_rate`, `avg_turnaround_hours`, `active_tasks`

### RLS Summary

After `rls-patch.sql`, most core tables have broad policy: `auth.uid() is not null` for all operations. Fine-grained access is enforced at the **API route level**, not in the DB.

Exceptions with stricter RLS: `client_accounts`, `brand_documents`, `feedback`, `leaves`, `app_settings`, `ops_links`.

---

## 8. AI Integration

### Meeting Extraction (`/api/brands/meeting` — extract action)

- **Primary:** Claude Haiku (`ANTHROPIC_MODEL_ID` env var, defaults to `claude-haiku-4-5-20251001`)
- **Fallback 1:** Groq `llama-3.3-70b-versatile`
- **Fallback 2:** Gemini `gemini-2.5-flash-preview-05-20`
- Single message → expects pure JSON back. No tool use.
- Extracts: `summary`, `decisions[]`, `tasks_suggested[]`, `knowledge_delta[]`, `contacts[]`
- Existing `brands.knowledge.rules` are included in the prompt so the model only returns NEW learnings (delta). Merged into JSONB on confirm.

### AI Allocator (`/api/chat`)

- **Primary:** Claude Sonnet (`claude-sonnet-4-6`)
- **Fallback 1:** Groq `llama-3.3-70b-versatile`
- **Fallback 2:** Gemini `gemini-2.5-flash`
- Access gate: 403 for non-admin/lead
- **System prompt context includes:** current IST datetime, user's name/role, all team members + active hour load, all brands + their knowledge rules, last 60 days of meeting summaries with high-impact decisions. Cached with `cache_control: ephemeral`.
- **Tools:**
  - `create_task_and_block` — resolves brand by slug, owner/reviewer by first name. Clamps times to 09:00–19:30 IST. Conflict check on blocks. Inserts task + references + block. Optional GCal event creation (non-blocking). Notifies Slack.
  - `reassign_task` — finds task by keyword match, reassigns owner + optional new block.
- **Agentic loop:** up to 20 tool iterations per request.

---

## 9. Auth Flow

### Internal Staff (Slack OAuth)

1. `/login` → "Sign in with Slack" → Supabase Slack provider (restricted to `edernityteam` workspace in Supabase Auth settings)
2. Supabase redirects to `/api/auth/callback?code=xxx`
3. Callback: `supabase.auth.exchangeCodeForSession(code)` → gets user
4. Looks up `people` row by email:
   - Row exists + `auth_user_id` is null → admin client sets it
   - No row → admin client creates one from Slack profile metadata
5. Redirect to `/dashboard`

### Middleware (`middleware.ts`)

Every request (except static assets) goes through middleware:
- Calls `supabase.auth.getUser()`
- Path classification: `isPublic` | `isClientRoute` | `isInternalRoute`
- **Client routes** (`/client/*`): must have `client_accounts` row with `is_active = true`. Otherwise → `/client/login`
- **Internal routes**: must have user session. Otherwise → `/login`. If a client user hits an internal route → `/client`
- Public paths: `/login`, `/demo/**`, `/api/auth/**`, `/api/cron/**`, `/client/login`, `/api/client/**`

### Client Portal Auth

- Email/password via Supabase Auth (not Slack)
- Created by admin: `POST /api/admin/client-accounts` → Supabase admin auth API `createUser`
- `client_accounts` table links `auth_user_id` → `brand_id`
- Middleware checks `is_active` before allowing access to `/client/*`

### People → Auth Linking

- `people.auth_user_id` is the critical link. All RLS policies check against it.
- Staff are pre-seeded by email. `auth_user_id` is null until first Slack login.
- The auth callback sets it automatically.
- Manual fallback (Supabase SQL Editor):
  ```sql
  UPDATE people SET auth_user_id = '<uuid>' WHERE email = '<email>';
  ```

---

## 10. Key Business Logic

### Access Tier Enforcement

Enforced in every API route. **Not enforced in the DB** (broad RLS).

| Tier | What they can do |
|---|---|
| `admin` | Full access everywhere |
| `lead` | Same as admin for most operations |
| `operations` | Team-wide view on calendar/tasks; Harmony Core |
| `hr` | HR module (feedback, leaves) |
| `poc` | Meeting logging, brand visibility (not fully activated) |
| `staff` | Own tasks only; cannot assign to others |
| `viewer` | Read-only scoped access |

App layout normalises tiers: `admin|lead → 'admin'`, `operations → 'operations'`, `hr → 'hr'`, `viewer → 'poc'`, everything else → `'staff'`.

### Flexible vs Regular Tasks

- **Regular:** specific datetime start + deadline. Creates a `blocks` row. Appears in calendar grid.
- **Flexible:** `flexible = true`. `start_date = T00:00:00Z`, `deadline = T23:59:59Z`. No blocks row. No conflict check. Appears as date-range chips above the calendar grid (one chip per day spanned).

### Recurrence

- Patterns: `weekdays`, `daily`, `weekly`, `custom` (with `customDays` array, 0=Mon–6=Sun)
- End condition: `occurrences` (max 60) or `end_date`
- All slots conflict-checked before any DB write — atomic or nothing
- One `tasks` row + multiple `blocks` bulk-inserted

### Conflict Detection

Two layers:
1. **P0 gate** (task create): same employee OR same brand already has active P0 overlapping → 409 with `warning: true`. UI must re-submit with `force: true`.
2. **Block check** (task create + chat route): `blocks` where same `person_id` + `start_at < newEnd AND end_at > newStart` + task status not done/approved/cancelled. Returns formatted string with conflicting task name + time.

### Delay Check Cron (09:00 IST daily)

- Finds tasks with status `scheduled|in_progress` + deadline past + no submission
- Sends "Due in 24h" Slack alerts for tasks due within next 24h
- Triggered by cron-job.org hitting `/api/cron/delay-check` with Bearer token

### Slack Notification Types

All via `SLACK_WEBHOOK_URL` → #chord-os:

`task_assigned` · `recurring_task_assigned` · `task_updated` · `task_reassigned` · `task_approved` · `task_rework_requested` · `task_rejected` · `task_acknowledged` · `task_submitted` · `task_delayed` · `due_in_24h` · `repeat_delay` · `revision_threshold`

Harmony Core tracker updates go to `HARMONY_CORE_WEBHOOK_URL` (separate webhook).

### Datetime — IST Convention

- All datetimes stored as **UTC** in Supabase
- Display is **IST (UTC+5:30)**
- `IST_OFFSET_MS = 5.5 * 60 * 60 * 1000`
- **Never use `toISOString()` for local date comparisons** — it shifts IST dates back one day. Use `getFullYear()`, `getMonth()`, `getDate()`.

### Google Calendar (per-user, optional)

- User connects via `/api/auth/google` → stored as `refresh_token` on their `people` row
- When chat allocator creates a task block, it auto-creates a GCal event if the owner has a refresh token
- Failure is non-blocking (caught with `console.warn`)
- `/api/calendar/google-events` fetches and overlays events on the calendar view
- Returns `token_expired: true` on 401/403 — UI shows reconnect prompt

---

## 11. Components

| Component | What it does |
|---|---|
| `sidebar-nav.tsx` | Left sidebar. Renders links based on `tier` prop. |
| `sidebar-user.tsx` | Bottom user card in sidebar. |
| `mobile-drawer.tsx` | Mobile slide-out nav drawer. |
| `task-create-modal.tsx` | Full task creation form (brand, owner, type, priority, time/date, recurrence, reviewer). Calls `POST /api/tasks`. |
| `task-detail-modal.tsx` | Full task detail: status progression (acknowledge → submit link → review flow), reassign, edit, delete. |
| `task-list-client.tsx` | Filterable task list (status/brand/person filters). |
| `context-modal.tsx` | Calendar block click → brand colors, voice, references, brief inline. |
| `brand-documents.tsx` | Upload + list brand docs (Supabase Storage `briefings` bucket). |
| `brand-performance.tsx` | Brand metrics/charts. |
| `add-person-modal.tsx` | Add team member (admin only). |
| `edit-profile-modal.tsx` | Edit own profile. |
| `add-client-login-modal.tsx` | Admin creates client portal login. Calls `POST /api/admin/client-accounts`. |
| `portal-line-chart.tsx` | Recharts line chart for client portal (data from Google Sheets). |

---

## 12. Lib Utilities

| File | When to use |
|---|---|
| `lib/supabase/client.ts` — `createBrowserClient()` | Browser/client components only |
| `lib/supabase/server.ts` — `createServerClient()` | Server components + API routes (user-scoped, respects RLS) |
| `lib/supabase/admin.ts` — `createAdminClient()` | Server only: auth callback, meeting confirm, client account creation. Bypasses RLS. Never expose. |
| `lib/supabase/get-authed-person.ts` — `getAuthedPerson(fields)` | Returns `{ person, user, unauth }`. `unauth` is a pre-built 401 if not logged in. |
| `lib/slack.ts` — `notifySlack(msg)` | Sends to `SLACK_WEBHOOK_URL`. Use typed helpers: `slack.approved()`, `slack.submitted()`, etc. |
| `lib/activity.ts` — `logActivity(params)` | Fire-and-forget activity log (uses admin client → `activity_logs`). Never awaited. |
| `lib/google-calendar.ts` | `createCalendarEvent`, `getGoogleEventsHours`, `deleteCalendarEvent`. All take `refreshToken`. Returns `-1` on expired token. |
| `lib/mock-data.ts` | Static mock data for `/demo` routes. |

---

## 13. Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (browser + server with session) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Bypasses RLS — server only, never expose |
| `ANTHROPIC_API_KEY` | Yes | Claude API |
| `ANTHROPIC_MODEL_ID` | Optional | Defaults to `claude-sonnet-4-6` (chat) / `claude-haiku-4-5-20251001` (extraction) |
| `GROQ_API_KEY` | AI fallback | Groq API (free tier: console.groq.com) |
| `GROQ_MODEL_ID` | Optional | Defaults to `llama-3.3-70b-versatile` |
| `GEMINI_API_KEY` | AI second fallback | Google AI Studio (free: aistudio.google.com) |
| `SLACK_WEBHOOK_URL` | Notifications | Incoming webhook → #chord-os |
| `HARMONY_CORE_WEBHOOK_URL` | Notifications | Separate webhook for Harmony Core updates |
| `NEXT_PUBLIC_APP_URL` | Yes | `https://chord-os.theampmworld.com` — used in Google OAuth redirect URI |
| `CRON_SECRET` | Cron security | Random string. All cron endpoints require `Authorization: Bearer <secret>` |
| `GOOGLE_CLIENT_ID` | GCal + Forms | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | GCal + Forms | Google OAuth app client secret |
| `GOOGLE_SHEETS_API_KEY` | Client portal | Reads client ops tracker sheet |
| `SLACK_CLIENT_ID` | Auth | Slack app client ID (also set in Supabase Auth → Slack provider) |
| `SLACK_CLIENT_SECRET` | Auth | Slack app client secret |

> Note: `OPENAI_API_KEY` appears in CLAUDE.md but is not used in the codebase. Chat uses Anthropic → Groq → Gemini.

---

## 14. SQL Files — Full Inventory

Run these in Supabase SQL Editor (production and staging separately):

| File | What it creates |
|---|---|
| `SQL/schema.sql` | ⚠️ Currently empty — schema was set up directly in Supabase |
| `SQL/rls-patch.sql` | ⚠️ CRITICAL — relaxes RLS on core tables. Without this, all queries return empty. Also adds `ai_gate_results` + `chat_messages` policies. |
| `SQL/meeting-schema.sql` | `brand_meetings` table + `knowledge` JSONB on `brands` + `meeting_id` + `brief` on `tasks` |
| `SQL/access-tier.sql` | `access_tier` column on `people` (default `staff`). Promotes `is_team_lead=true` → `admin` |
| `SQL/features-patch.sql` | Task lifecycle columns (`acknowledged_at`, `submission_link`, `submitted_at`, `on_time`, `revision_round`, `delay_count`). `task_revisions` table. `member_stats` view. |
| `SQL/leaves.sql` | `leaves` + `leave_balances` tables with RLS |
| `SQL/leaves_add_approver.sql` | Adds `approver_id` to `leaves` |
| `SQL/leaves_rename_types.sql` | Renames leave type values |
| `SQL/feedback.sql` | `feedback` table with RLS |
| `SQL/feedback_add_rating.sql` | Adds `rating` column to `feedback` |
| `SQL/feedback_drop_hr_notes.sql` | Drops `hr_notes` from `feedback` |
| `SQL/client-portal-patch.sql` | `client_accounts` table with RLS |
| `SQL/brand-documents-patch.sql` | `brand_documents` table (Storage: `briefings` bucket) with RLS |
| `SQL/operations-patch.sql` | `app_settings` key/value table |
| `SQL/operations-links-patch.sql` | `ops_links` table |
| `SQL/activity-logs.sql` | `activity_logs` table (lib/activity.ts target) |
| `SQL/start-date-patch.sql` | Adds `start_date` column to `tasks` |
| `SQL/add_hr_tier.sql` | Adds `hr` as valid `access_tier` value |
| `SQL/seed.sql` | 20 people + 4 brands (IndiaGate/TrueSilver/AlphaKid/Vadilal) + demo tasks |

---

## 15. Deployment

**Platform:** Vercel

**Branch → environment mapping:**

| Branch | Environment | Supabase | Slack |
|---|---|---|---|
| `main` | Production (`chord-os.theampmworld.com`) | Production (RLS enabled) | Notifications ON |
| `develop` | Staging (Vercel preview URLs) | Staging project (RLS disabled) | Notifications OFF (`SLACK_WEBHOOK_URL` unset) |

**Cron setup (via cron-job.org):**

| Job | URL | Schedule | Header |
|---|---|---|---|
| Delay check | `https://chord-os.theampmworld.com/api/cron/delay-check` | 03:30 UTC daily | `Authorization: Bearer <CRON_SECRET>` |
| Ops reminder | `https://chord-os.theampmworld.com/api/cron/ops-reminder` | 05:00 UTC daily | `Authorization: Bearer <CRON_SECRET>` |

**Google OAuth — must be registered in Google Cloud Console:**
- Redirect URI: `https://chord-os.theampmworld.com/api/auth/google/callback`
- Also add `http://localhost:3000/api/auth/google/callback` for local dev

**New people setup (after first Slack login):**
1. Find their UUID in Supabase → Auth → Users
2. Run: `UPDATE people SET auth_user_id = '<uuid>' WHERE email = '<email>';`
3. Set correct `access_tier` if not `staff`

---

## 16. Critical Gotchas

1. **`schema.sql` is empty.** The schema was set up directly in Supabase and never committed. To set up a fresh DB, run all the SQL patch files in the order listed in Section 3. `rls-patch.sql` is the most critical — without it everything returns empty.

2. **Two activity log tables.** `activity_log` (FK-based, written by chat/task routes) vs `activity_logs` (text-based, written by `lib/activity.ts`). Not consolidated. Don't mix them up.

3. **Never use `toISOString()` for date comparisons.** IST is UTC+5:30. `toISOString()` converts to UTC and shifts the date back one day for any time before 05:30 IST. Use `getFullYear()`, `getMonth()`, `getDate()` to build date strings for local comparisons.

4. **CLAUDE.md mentions `OPENAI_API_KEY` — this is stale.** The actual AI stack is Anthropic → Groq → Gemini. OpenAI is not used anywhere in the codebase.

5. **Admin client (`createAdminClient`) bypasses RLS entirely.** Only use it in the three documented scenarios: auth callback, meeting confirm, client account creation. Using it anywhere else is a security hole.

6. **`people.auth_user_id` is null until first login.** Pre-seeded people rows have no `auth_user_id`. The Slack OAuth callback sets it automatically. If someone can't log in or sees empty data, check this field first.

7. **Client portal is completely separate auth.** Clients log in with email/password, not Slack. Middleware routes them to `/client/*` only. If a client somehow hits an internal route, middleware redirects them to `/client`.

8. **`demo/` is 100% public.** No auth middleware. Uses static mock data. Safe for investor/stakeholder demos. Never accidentally put real data there.

9. **Google Calendar is per-user and optional.** The `refresh_token` is stored per person. When the chat allocator creates a block, it tries to create a GCal event for the owner. Failure is `catch` + `console.warn` — it doesn't break task creation.

10. **Staging Slack notifications are silenced by unsetting `SLACK_WEBHOOK_URL`.** This is intentional — don't add the webhook to staging Vercel env vars.

11. **Harmony Core carry-over runs on every read.** The `GET /api/harmony-core` auto-seeds the current month from the prior month for social-role people with unfinished scope. This means every page load can trigger a DB write. It's idempotent but worth knowing.

12. **P0 conflict gate returns 409 with `warning: true`, not a hard error.** The UI must re-submit with `force: true` to override. Make sure any client calling `POST /api/tasks` handles 409 correctly.
