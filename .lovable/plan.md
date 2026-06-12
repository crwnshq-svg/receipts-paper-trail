## Receipts — Full Build Plan

This is a large spec that supersedes parts of what's already built (pricing changes from $10/$110 to $15/$150, storage from 50MB to 75MB, adds Stripe, Anthropic, doc generation, case packages, passive AI, etc.). I'll build it in phases so each is testable, and confirm a few decisions before I start.

### Decisions I need from you

1. **AI provider**: You specified Anthropic Claude (`claude-sonnet-4-6`) directly. Lovable Cloud includes a built-in AI Gateway (no key needed) that supports Claude models. Do you want:
   - **A.** Use Lovable AI Gateway (no setup, billed via Lovable credits) — recommended
   - **B.** Bring your own Anthropic API key (I'll request it as a secret)
2. **Payments**: I'll use Lovable's built-in Stripe payments (no Stripe account setup needed — uses Lovable as merchant of record). Confirm OK, or do you want to connect your own Stripe account?
3. **Email sequences** (welcome, 48h educational, storage warning, discount): these need a transactional email provider. OK to scaffold the email infra now or defer to a later phase?
4. **Certified mail** ($10.99): there's no built-in carrier integration. OK to ship this as a UI stub that records a tracking-number field manually for now (real Lob/USPS integration is a separate add-on)?

### Phase 1 — Schema, design system, billing rules realignment

- Migrate DB to the new schema you specified: `users` extensions (ai_questions_used, stripe_customer_id), `cases` (module, sub_type, custom_sub_type, strength_score, status), `incidents` (raw_input, formatted_entry, category, passive_ai_flagged), `documents` (detected_type, extracted_data, exhibit_label, user_note, flag fields), `generated_documents`, `case_packages`, `ai_conversations`, `passive_ai_flags`. RLS + GRANTs on each.
- Update design tokens in `src/styles.css` to the new palette (#FAFAFA bg, #1A1A2E primary, #00A878 accent, #E53E3E error, Inter font, 12px/8px radii). Replace the current "Calm legal" navy/gold theme.
- Update storage cap constants to 75MB, plan prices to $15/$150, $49/$9.
- PWA manifest already exists — update theme/background colors to match new palette.

### Phase 2 — Public + onboarding

- Landing page (`/`) per spec: hero, how-it-works, 3 feature blocks, pricing table, footer with disclaimer.
- Module intro screen (`/get-started`).
- Account creation (`/auth`) with first_name field, Google OAuth (already wired), terms checkbox.
- Welcome overlay on first dashboard load.

### Phase 3 — Case lifecycle (free tier core)

- Dashboard with case grid, status badges, strength bar, last-activity, "locked second case" tile for free tier.
- Bottom nav (Dashboard / Resources / Account) + top nav (wordmark + avatar).
- 4-step case creation flow with module → sub-type chips → AB5 qualifier for "I did work and wasn't paid" → foundation doc prompt.
- Case dashboard: strength bar, 2×2 section grid, passive-AI banner area, Receipts AI button with counter.
- Document Vault: storage bar (60MB orange / 75MB red freeze), evidence checklist, exhibit labeling, FAB upload sheet (camera/library/file).
- Incident Log + entry screen with AI-formatted preview/confirm step.
- Case Timeline with vertical timeline + PDF export.
- Case strength calculation rule (0/20/40/60/80/100).
- 48h foundation-doc reminder banner.

### Phase 4 — AI features (Anthropic / Lovable AI)

- Receipts AI chat (free: 3-question counter + guided 3-question intake; paid: unlimited). Disclaimer on every response.
- Passive AI background analysis after every doc upload / incident log entry → writes `passive_ai_flags` (JSON-structured). Free shows message only; paid shows full_explanation + suggested_action.
- Document detection on upload (detected_type + extracted_data).
- Incident AI-formatting step.
- All AI server-side via TanStack `createServerFn` so the key never hits the client.

### Phase 5 — Document generation + case package (paid)

- Doc generation page with card grid (Demand Letter, Formal Complaint, etc.), recipient selector, generation loader, editable result, Download PDF / Email / Certified Mail buttons. Free tier sees locked cards.
- Certified mail flow (address → confirm → success with manually-entered tracking #), creates the auto Day 0/3/10 timeline entries and Day-10 reminder.
- Case Package builder ($49) with section toggles, personal statement, recipient, Stripe one-time checkout, processing → PDF result. Regen first free, then $9.

### Phase 6 — Stripe + tiers

- Lovable Payments: Monthly $15 subscription, Annual $150 subscription, $49 + $9 one-time products.
- Upgrade modal (reusable) triggered by: locked feature, 75MB freeze, 3-question AI cap, second-case attempt, passive-AI flag explanation.
- Post-upgrade confirmation screen that returns to the prior route.
- Webhook → updates `users.subscription_tier` / `subscription_status`.

### Phase 7 — Resources + Account + Email

- Resources page (module tabs, action categories, partner directory with Basic/Featured/Badge tiers) — public to all tiers.
- Account/Settings: tier, storage bar, AI questions remaining, notification toggles, billing portal link, support, logout.
- Email sequences (welcome / 48h educational / storage warning / 14-day discount $130).

### Technical notes (for reference)

- Stack stays TanStack Start + Lovable Cloud (Supabase) + Lovable Payments. All AI calls go through server functions (`src/lib/ai.functions.ts`). Anthropic via Lovable AI Gateway model id `anthropic/claude-sonnet-4-5` (closest available; `claude-sonnet-4-6` is not a public model id — I'll use the latest available Claude Sonnet).
- PDFs generated server-side with `pdf-lib`.
- Existing routes/components from the foundation pass will be refactored, not duplicated.

Reply with your decisions on the 4 questions above (or just "go" to take my defaults: Lovable AI Gateway, Lovable Payments, defer email infra, certified-mail as manual stub) and I'll start with Phase 1.
