// Lightweight prefill bus used by AI action buttons → forms.
// AI emits a `prefill` object on each action; we stash it in sessionStorage
// under a scope, and the receiving form pops it on mount.

export type PrefillScope = "incident" | "document" | "case";

const KEY = (scope: PrefillScope) => `receipts.prefill.${scope}`;

export const PREFILL_EVENT = "receipts:prefill";

export function setPrefill(scope: PrefillScope, data: Record<string, any>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY(scope), JSON.stringify(data));
    // Notify already-mounted forms so they can pop the new prefill on the
    // spot — without this, navigating to a route whose prefill-consuming
    // component is already mounted (e.g. tapping a "generate document"
    // action while already on the AI tab) silently drops the prefill.
    window.dispatchEvent(new CustomEvent(PREFILL_EVENT, { detail: { scope } }));
  } catch {
    /* ignore quota errors */
  }
}

export function popPrefill<T = Record<string, any>>(scope: PrefillScope): T | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEY(scope));
  if (!raw) return null;
  sessionStorage.removeItem(KEY(scope));
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
