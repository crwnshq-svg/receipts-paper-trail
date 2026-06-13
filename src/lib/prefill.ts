// Lightweight prefill bus used by AI action buttons → forms.
// AI emits a `prefill` object on each action; we stash it in sessionStorage
// under a scope, and the receiving form pops it on mount.

export type PrefillScope = "incident" | "document" | "case";

const KEY = (scope: PrefillScope) => `receipts.prefill.${scope}`;

export function setPrefill(scope: PrefillScope, data: Record<string, any>) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(KEY(scope), JSON.stringify(data));
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
