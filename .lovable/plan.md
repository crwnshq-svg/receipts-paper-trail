# Plan: Email Verification + Editable File Names + Delete File

## Part 1 — Email Verification Gate

**Auth config**
- Call `supabase--configure_auth` with `auto_confirm_email: false` so signup sends a confirmation email.
- Keep `signUp({ options: { emailRedirectTo: window.location.origin + "/dashboard" } })` already in place.

**Branded confirmation email**
- Scaffold auth email templates via `email_domain--scaffold_auth_email_templates` (requires email domain). If no email domain is set, surface the setup dialog so the user provisions one; meanwhile the default Supabase email still works.
- Update the `signup` template: subject "Verify your email for Pull Up Receipts", button labeled "Verify My Email", brand styled.

**In-app gate**
- New component `EmailVerificationGate` (in `src/components/email-verification-gate.tsx`) that renders a full-screen card: heading, copy "Please check your email and verify your address to continue.", and a `Resend verification email` button with a 60s cooldown (local state countdown; calls `supabase.auth.resend({ type: 'signup', email })`). Also a "I've verified — refresh" button that calls `supabase.auth.refreshSession()` + `router.invalidate()`.
- Modify `src/routes/_authenticated/route.tsx` so the `beforeLoad` still allows entry, but the component checks `user.email_confirmed_at`. If missing, render `<EmailVerificationGate>` instead of `<Outlet>`. This blocks both dashboard and onboarding while user is signed in but unverified.

## Part 2 — Editable File Fields

**Reusable inline editor**
- New `EditableField` component pattern matching evidence-card pencil pattern (read existing pattern in `src/components/document-card.tsx` first).
- Fields editable: `cases.title` (file name), `cases.opposing_party` (other party), `cases.dispute_type` (module — Select).

**Where to add pencils**
- `src/routes/_authenticated/cases.$caseId.tsx` — header (title, opposing_party, dispute_type).
- `src/routes/_authenticated/dashboard.tsx` — file cards (title only, pencil opens small modal).
- `src/routes/_authenticated/cases.index.tsx` — Files list cards (title only).

**Persistence + cache**
- On save: `supabase.from('cases').update({...}).eq('id', caseId)` then `queryClient.invalidateQueries({ queryKey: ['cases'] })` and `['case', caseId]`. AI chat references read from the same cache, so refresh is automatic.

## Part 3 — Delete File with Confirmation

**UI**
- Add a dropdown menu (three dots) on dashboard file cards and a `Delete file` button in the File Overview header.
- Shared `DeleteCaseDialog` with title "Delete this file", warning text "This action cannot be undone.", checkbox "Also delete all evidence, events, and notes associated with this file" (default unchecked), Cancel + Delete buttons.

**Delete logic**
- Always cascade (per spec: when unchecked, still cascade to avoid orphans, but show extra subtle note). Implementation: explicitly delete from `incidents`, `documents`, `document_insights`, `notes`, `generated_documents`, `ai_conversations`, `passive_ai_flags`, then `cases` row — all scoped to the case_id. Run inside a server function `deleteCase` (createServerFn + requireSupabaseAuth) so RLS-protected deletes happen reliably.
- After success: `queryClient.invalidateQueries({ queryKey: ['cases'] })`, toast, navigate to `/dashboard`.

## Files to add
- `src/components/email-verification-gate.tsx`
- `src/components/editable-text.tsx` (inline pencil edit)
- `src/components/delete-case-dialog.tsx`
- `src/lib/cases.functions.ts` (deleteCase server fn)

## Files to edit
- `src/routes/_authenticated/route.tsx` — verification gate
- `src/routes/_authenticated/cases.$caseId.tsx` — editable header + delete button
- `src/routes/_authenticated/dashboard.tsx` — editable name + delete menu on cards
- `src/routes/_authenticated/cases.index.tsx` — editable name on cards (optional pencil)
- Auth email template files after scaffold (subject + button copy + brand)

## Open questions
None — proceeding with cascade-always semantics for delete as the spec describes.
