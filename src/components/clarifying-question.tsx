import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Soft-tinted clarifying-question card.
 * Use everywhere AI surfaces a clarifying question:
 *  - inline after a just-logged Event/Note
 *  - as a persistent prompt on the File Overview
 *  - as the final beat in a chat bubble sequence
 *
 * Hard rule (enforced by callers): only one clarifying question may be live and
 * unanswered at a time per File. Never render two stacked.
 */
export function ClarifyingQuestion({
  question,
  options,
  onAnswer,
  onDismiss,
  className,
}: {
  question: string;
  /** Quick tap options. If omitted, renders a short text input. */
  options?: string[];
  onAnswer: (answer: string) => void | Promise<void>;
  onDismiss?: () => void;
  className?: string;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(answer: string) {
    console.log('[clarifying-question] submit called', { answer, busy });
    if (busy || !answer.trim()) return;
    setBusy(true);
    try { await onAnswer(answer.trim()); } finally { setBusy(false); }
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 space-y-2.5 animate-in fade-in slide-in-from-bottom-1 duration-300",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
          <Sparkles className="h-3 w-3" /> one quick thing
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="text-sm text-foreground/90 leading-snug">{question}</p>

      {options && options.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {options.map((opt) => (
            <button
              key={opt}
              type="button"
              disabled={busy}
              onClick={() => submit(opt)}
              className="rounded-full bg-background border border-sky-500/30 hover:bg-sky-500/15 px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => { e.preventDefault(); void submit(text); }}
          className="flex gap-2 pt-0.5"
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Short answer…"
            disabled={busy}
            autoFocus
            className="h-8 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={busy || !text.trim()}
            className="bg-primary text-primary-foreground"
          >
            Send
          </Button>
        </form>
      )}
    </div>
  );
}
