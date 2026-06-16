# Plan: Conversational RECEIPTS AI Overhaul

This is a large, interconnected change. Below is what I'll build, grouped by part. I'll flag a few decisions where I need your call before I start.

## Part 1 — Summary length rule (small, isolated)

**File:** `src/lib/insight-prompts.ts`

- Replace the 4-sentence / 4-part structure in the document and event summarization system prompts with: **"Max 2 sentences, 1 preferred. State the single most important fact the document/event factually establishes; if a second sentence fits, say why it matters to the case. No speculation. Never tell the user to review it themselves."**
- Applies to: document summaries, event summaries, post-upload reactions.

## Part 2 — Sequenced chat bubbles

**Files:** `src/components/ai-tab.tsx`, `src/lib/insight-prompts.ts` (chat system prompt), possibly `src/routes/api/chat.ts`.

- Update chat system prompt: respond as a sequence of short beats separated by a delimiter (e.g. `\n---\n` or `<<<BEAT>>>`). Beat 1 = direct one-sentence answer. Beat 2 = supporting detail. Beat 3 = optional action/resource. Each beat 1–2 sentences max.
- On the client, split the streamed assistant text on the delimiter and render each chunk as its own bubble. Once the stream finishes, reveal bubbles 2+ on a staggered timer (~900ms) with a fade/translate-y CSS transition.
- During streaming, show only the first beat live; subsequent beats animate in after stream end so the staggering reads cleanly.

## Part 3 — Clarifying-question component

**New file:** `src/components/clarifying-question.tsx`

- Softly tinted card (uses `bg-info`/equivalent semantic token already in `styles.css`), small "one quick thing" label, the question, then either:
  - Tap-to-answer chips (binary / short set), or
  - Short text input (when open-ended).
- Three render contexts, all using the same component:
  1. Inline under a just-logged Event/Note (timeline-tab).
  2. Persistent badge on the File Overview screen (cases.$caseId.tsx).
  3. Final beat in an AI chat bubble sequence (ai-tab).
- **Hard rule — one live question per File at a time.** Implement via a new `case_clarifying_questions` table (one active row per case) OR a single nullable `active_clarifying_question` jsonb column on `cases`. **I'll use a jsonb column on `cases`** — simpler, enforces "one at a time" by design, no extra table.
- System-prompt rule: AI may only interrupt an in-progress action for time-sensitive evidence (camera-overwrite, deadline within hours, evidence being destroyed). Otherwise it waits for a natural pause.

## Part 4 — Partner card redesign

**Files:** `src/components/ai-tab.tsx` (partner card render), `src/lib/insight-prompts.ts` (system prompt rules).

- Soft green-tinted background (semantic `success` token at low opacity), check icon, "Verified Pull Up Receipts Partner" label in green, name, specialty + location on one line, Contact button.
- Below card: muted gray line — "No pressure either way — your file stays just as strong if you keep going solo."
- System-prompt rule: surface only on (a) genuine escalation/pattern moment, or (b) explicit user request. **Frequency cap: max 1 partner card per chat session.** I'll track this client-side in `ai-tab.tsx` session state (resets on page reload), and instruct the model in the system prompt with the current session count.

## Part 5 — Conversational File creation

**File:** `src/routes/_authenticated/cases_.new.tsx` (full rewrite).

- Replace the current form with a bubble-style 2-step flow:
  1. AI bubble: "What's going on?" → open text input.
  2. On submit, call a new server function `inferCaseDraft` (`src/lib/cases.functions.ts`) that uses the AI gateway to infer `dispute_type` ∈ {landlord_tenant, employer_employee, other} and `opposing_party` from the free text.
  3. AI bubble: "Sounds like a landlord situation with **Willow Grove Apartments** — that right?" with **Yes** / **Let me fix that** chips. "Let me fix that" reveals two compact editable chips (module + party name).
- On confirm: create the case with the confirmed module + party, store the user's original text as `description`, navigate to the new case.

## Part 6 — Conversational Event logging

**File:** `src/components/timeline-tab.tsx` (the "add event" UI section).

- Replace the form with: AI bubble "What happened?" → open textarea (defaults `occurred_at` to `new Date()` silently).
- On submit, save a minimal event immediately (so we don't lose data), then run a new `inferEventMetadata` server function in the background. Show "Logging this as **Illegal Entry** — sound right?" chip with **Yes** / **Change category** options.
- If related evidence/past events detected, show them as small tappable suggestion chips to attach (writes to `incident_documents` join — I'll check the existing schema; if no join table exists I'll skip evidence linking and just surface them as visual chips referencing existing relations).
- After save, hand off to the Part 3 clarifying-question component inline.

## Part 7 — Conversational evidence upload + in-chat upload

**Files:** `src/components/ai-tab.tsx`, `src/components/document-card.tsx` (or upload entry point — I'll locate it), `src/lib/document-intelligence.functions.ts`.

- After upload, AI reacts with one short sentence (per Part 1) + a confirm chip: "Got it — this looks like your lease, section 8 specifically. Save it as that?" → **Yes** / **Rename**.
- Allow drag/drop + file picker in the chat composer (`ai-tab.tsx`). Routing:
  - Inside a File's AI tab or Event AI thread → attach silently to that File.
  - Unscoped AI companion + exactly 1 active File → confirm chip "Add this to your **[File]** file?" Yes / Choose different.
  - Unscoped + multiple active Files → ask which, list as chips.
  - No active Files or user says "new situation" → kick off Part 5 flow with the upload pre-attached.
- The chat reaction stays one short sentence; full analysis lives in the Evidence Vault document card.

**Decision needed:** there isn't currently an "unscoped AI companion" route in the app — the AI tab lives inside a specific case. Options:
- (A) Add a new `/ai` route for unscoped chat, and implement the routing logic there.
- (B) Only implement the in-File / in-Event in-chat upload paths now, and defer the unscoped routing (Part 7's last 3 bullets) until the unscoped surface exists.

## Database changes

One small migration:
- Add `active_clarifying_question jsonb` column to `public.cases` (nullable), with appropriate GRANT update permission for `authenticated` on that column.

## Things I'd like you to confirm before I start

1. **Part 7 unscoped chat** — option (A) build a new `/ai` page, or (B) defer that subset?
2. **Bubble delimiter** — I'll use `\n---\n` between beats in the model output. OK, or prefer a different marker?
3. **Frequency cap on partner cards** — session-scoped (resets on reload) is simplest. Or do you want it persisted per-conversation in the DB?

Once you answer (or say "your call, go"), I'll implement everything in one pass.