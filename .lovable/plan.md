## Scope

Four related features for the case detail and app shell. I'll use Lovable AI Gateway (Gemini) rather than the Anthropic Claude models you named — this project doesn't have an Anthropic key and the gateway uses Gemini models. The hedged-language guardrails work the same regardless of model. If you want true Anthropic Claude, add an `ANTHROPIC_API_KEY` and I'll swap the calls.

## Part 1 — Case Timeline tab

- Add a 4th tab "Timeline" on `/cases/$caseId`.
- Build a virtual timeline by unioning rows from `cases` (created), `incidents`, `documents`, `generated_documents`, and a new `ai_insights` source.
- Each entry: colored dot (red/blue/yellow/green/gray), timestamp, type badge, brief description.
- Tapping an entry scrolls/switches to the corresponding tab and highlights the item (`?focus=<id>` query param).
- "Export Timeline" button → generates a `.txt` download client-side (faster than PDF and works offline).

## Part 2 — Document intelligence

- New column `documents.ai_summary` (text, nullable).
- New table `document_insights` (fields exactly as spec).
- New server fn `analyzeDocument(documentId)` invoked right after upload:
  1. Generate 4-sentence plain-English summary; for images, send `image_url` part to use vision.
  2. Cross-reference call against case context → 0–3 insight rows.
- Show skeleton on doc card while `ai_summary` is null and analysis is in flight.
- Edit button → inline textarea + save.
- Yellow lightbulb icon when insights exist; modal shows title + brief description + Follow Up + Dismiss.
- Follow Up: paid → open AI tab with pre-loaded context. Free → confirm "Use a Question to Follow Up", call `consumeAiQuestion`, then open chat. Both pass insight context via `sessionStorage` key the AI tab reads on mount.
- Add `profiles.last_active_at` (timestamptz); update via lightweight server fn called from app shell on mount (throttled to once per session).
- Weekly cron via Supabase Edge Function `weekly-insight-refresh` (pg_cron → calls TanStack route). Re-analyzes recent docs for users inactive ≥ 7 days.

## Part 3 — Notifications

- New table `notifications` (per spec).
- New table `admin_notifications` (per spec) with a trigger that fans out to `notifications` for matching users (by case module type and profile location).
- `documents` insight generation also inserts a notification.
- Bottom nav badge: unread count via realtime subscription on `notifications`.
- `/notifications` route: list, mark-as-read on view, tap → navigate to case/document.
- Web Push: register service worker, request permission after first sign-in, store subscription in `push_subscriptions` table. Edge function `send-push` triggered when a notification is created AND user is inactive ≥ 7 days.

> Web Push requires VAPID keys. I'll generate them and store as `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` secrets — no user action needed.

## Part 4 — Hedged language guardrails

- Central `INSIGHT_SYSTEM_PROMPT` constant containing the hedged-language rules and required closing disclaimer.
- All insight + summary generation uses it.
- Server post-processor ensures the disclaimer is appended if the model omits it.

## Technical details

- AI model: `google/gemini-3-flash-preview` via Lovable AI Gateway (existing setup).
- Migrations: one for `documents.ai_summary` + `document_insights` + `profiles.last_active_at`, one for `notifications` + `admin_notifications` + fan-out trigger + `push_subscriptions`.
- Files added: `src/routes/_authenticated/cases.$caseId.tsx` (Timeline tab inline), `src/components/document-card.tsx`, `src/components/insight-modal.tsx`, `src/routes/_authenticated/notifications.tsx`, `src/lib/document-intelligence.functions.ts`, `src/lib/notifications.functions.ts`, `src/lib/activity.functions.ts`, `public/sw-push.js`, `supabase/functions/weekly-insight-refresh/index.ts`, `supabase/functions/send-push/index.ts`.

## Confirm before I start

1. OK to use Lovable AI Gemini instead of Anthropic Claude? (Cheaper, no key needed. Hedged-language guardrails are identical.)
2. OK for me to provision VAPID keys for web push automatically?
3. Export Timeline as `.txt` (instant, no extra deps) — or do you specifically want PDF?