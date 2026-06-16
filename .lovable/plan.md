# 7-Part Overhaul Plan

## Part 1 — Unscoped RECEIPTS AI entry point
- New route `src/routes/_authenticated/ai.tsx` rendering a chat surface with `caseId=null`.
- Add **AI** nav item in `app-shell.tsx` (between Files and Alerts) on desktop nav + mobile bottom nav (becomes 6 items).
- Add persistent **Floating Action Button** in `AppShell` (bottom-right, above mobile nav) that links to `/ai`. Hidden when already on `/ai`.
- Refactor `ai-tab.tsx` to accept optional `caseId`. When null:
  - Seed first assistant beat: *"What's going on?"*
  - Do not load any case's prior conversation; use a fresh session-scoped thread.
  - Route user intent: describing new situation → kick off conversational File creation flow (Part 5 from prior turn, reused as a server fn `inferCaseDraft`); referencing existing File → if 1 active File, confirm chip; if >1, ask which; uploads → use existing chat upload routing.

## Part 2 — "Ask about this" on Events
- In `activity-tab.tsx`, under each event row add a small ghost button with `MessageCircle` icon: *"Ask about this"*.
- Click navigates to the File's AI tab with query param `?ask=event:<incident_id>`.
- `ai-tab.tsx` reads the param on mount, fetches the incident (title, description, occurred_at, category, severity, attached document refs), and immediately sends a synthetic system-context + auto-streams the first assistant response. No user input required, no pre-filled composer.

## Part 3 — Event editing with timestamp integrity
- Migration: `ALTER TABLE incidents ADD COLUMN edited_at timestamptz NULL;`
- In `activity-tab.tsx` event row, add `Pencil` icon → opens existing IncidentDialog in edit mode prefilled with current values.
- On save: update event fields + set `edited_at = now()`; never touch `created_at` or `occurred_at` unless user explicitly changes the date field.
- No visible "edited" badge.

## Part 4 — Alert Detail redesign
- New route `src/routes/_authenticated/notifications.$notificationId.tsx`.
- Update `notifications.tsx` list rows to link to this detail route instead of jumping to the File.
- Detail view sections (in order):
  1. **Full alert content** — title, body, why it matters, link to related case (text link, not auto-redirect). Uses existing gold-standard formatting.
  2. **"Discuss with RECEIPTS AI" button** — navigates to scoped AI (File AI tab if `related_case_id`, otherwise `/ai`) with `?ask=alert:<id>`, triggering same auto-first-response pattern as Part 2.
  3. **Resource card** — one specific resource matched by alert `type` / case `module_type`. Pull from existing Resources content (`resources.tsx` data). Fallback: nearest topical match; never a generic "browse Resources" link.
- On mount, mark notification read (update `is_read=true`, `read_at=now()`) and invalidate `notifications-unread`.

## Part 5 — Alerts list filter + collapse
- Add segmented filter at top of `notifications.tsx`: **All / Unread / Read** (default All).
- Unread rows: full card (title + body preview + timestamp + case chip).
- Read rows: condensed single line — title, muted "read" pill, relative timestamp. Click expands inline OR navigates to detail (use detail nav for consistency with Part 4); add a chevron-toggle for inline expand-in-place as a secondary affordance.

## Part 6 — Returning user check-in
- Fires once per fresh app launch (sessionStorage flag `receipts:checkin-shown`).
- Implemented in `AppShell` `useEffect`. Check priority:
  1. Query active cases for: passive AI flags with `severity='high'` not dismissed OR upcoming deadlines (within 7 days). If found → popup names the File + issue, CTA: *"Tell me what's new"* → `/cases/:id` AI tab with auto-first-response on the issue.
  2. Else if active cases exist → friendly prompt naming most-recently-updated File. CTA toggle: *"Log an event"* (opens IncidentDialog) or *"Upload evidence"* (file picker on that File).
  3. Else (no active files) → no popup.
- UI: small bottom-right card (reuse pattern from PushPermissionPrompt), with dismiss.

## Part 7 — Dashboard stat card interactivity
- In `dashboard.tsx`, wrap each of the 5 stat cards in a `<Link>` (or button) with:
  - `cursor-pointer hover:bg-secondary/60 transition-colors`
  - Files → `/cases`
  - Plan → `/account`
  - Storage → `/account` (storage section) OR most-recent case's vault if no storage page exists
  - Events → new `/events` aggregated route (lists all incidents across files) — small new route
  - AI Questions → `/account` for free tier; static (no link, no hover) when plan is unlimited

## Technical notes
- New table column: `incidents.edited_at timestamptz null`.
- New routes: `/ai`, `/notifications/$notificationId`, `/events`.
- AI auto-first-response uses existing `streamText` flow; pass initial system context as a hidden user-role message and call `sendMessage` programmatically on mount when `?ask=...` is present.
- FAB: fixed bottom-20 right-4 on mobile (above bottom nav), bottom-6 right-6 desktop.

## Decisions needed
1. **Storage card target** — `/account` (billing/plan area) OR a new dedicated `/storage` page listing files by size? I'll default to `/account` unless you say otherwise.
2. **Events aggregated view** — should `/events` show all events flat across files (with file name on each row), or grouped by file? Default: flat, newest first, filterable by file.
3. **Read alert expand** — tap-to-expand inline (revealing body in place) OR always navigate to detail page? Plan covers both; I'll default to **navigate to detail** for consistency with the new Alert Detail. Confirm if you want inline expand instead.
4. **FAB on `/ai`** — hide it (it would be redundant) or keep it visible everywhere uniformly? Default: hide on `/ai`.
