import JSZip from "jszip";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}

/**
 * Beta-only zip export for a single File. Assembles:
 *   - summary.txt: File summary + chronological timeline + full event details
 *   - evidence/<original-or-display-name>: every uploaded evidence file
 *
 * Intentionally simple — no new AI formatting. Reuses data already in DB.
 */
export async function exportCaseZip(caseId: string): Promise<void> {
  const toastId = toast.loading("Preparing export…");
  try {
    const [caseRes, incidentsRes, docsRes, notesRes, genRes] = await Promise.all([
      supabase.from("cases").select("*").eq("id", caseId).maybeSingle(),
      supabase.from("incidents").select("*").eq("case_id", caseId),
      supabase.from("documents").select("*").eq("case_id", caseId),
      supabase.from("notes").select("*").eq("case_id", caseId),
      supabase.from("generated_documents").select("*").eq("case_id", caseId),
    ]);

    if (caseRes.error || !caseRes.data) throw caseRes.error ?? new Error("File not found");
    const caseRow = caseRes.data;
    const incidents = incidentsRes.data ?? [];
    const docs = docsRes.data ?? [];
    const notes = notesRes.data ?? [];
    const generated = genRes.data ?? [];

    const partyName = (caseRow.opposing_party && caseRow.opposing_party.trim().length > 0)
      ? caseRow.opposing_party
      : caseRow.title;

    // ---- Build combined summary document (plain text) ----
    const lines: string[] = [];
    lines.push(`Pull Up Receipts — File Export`);
    lines.push(`File: ${partyName}`);
    if (caseRow.title && caseRow.title !== partyName) lines.push(`Title: ${caseRow.title}`);
    lines.push(`Type: ${caseRow.dispute_type}`);
    lines.push(`Status: ${caseRow.status_level === "case" ? "Case" : "File"}`);
    lines.push(`Started: ${new Date(caseRow.created_at).toLocaleString()}`);
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push("");

    lines.push("======================================================");
    lines.push("SUMMARY");
    lines.push("======================================================");
    lines.push(caseRow.description?.trim() || "(no summary)");
    lines.push("");

    // Chronological timeline (mixed entry types)
    type T = { at: string; label: string; description: string };
    // Exported timeline intentionally excludes AI-generated documents
    // (demand letters, complaints, etc.) — only actual logged events,
    // notes, and uploaded evidence appear here. The in-app timeline still
    // shows generated documents.
    const timeline: T[] = [
      { at: caseRow.created_at, label: "File created", description: caseRow.title },
      ...incidents.map((i: any) => ({ at: i.occurred_at, label: "Event logged", description: i.title })),
      ...notes.map((n: any) => ({ at: n.created_at, label: "Note", description: (n.content ?? "").slice(0, 200) })),
      ...docs.map((d: any) => ({ at: d.created_at, label: "Evidence uploaded", description: d.display_name ?? d.file_name })),
    ].sort((a, b) => +new Date(a.at) - +new Date(b.at));
    // Mark `generated` as intentionally unused for timeline purposes.
    void generated;

    lines.push("======================================================");
    lines.push("CHRONOLOGICAL TIMELINE");
    lines.push("======================================================");
    if (timeline.length === 0) {
      lines.push("(no entries)");
    } else {
      for (const t of timeline) {
        lines.push(`[${new Date(t.at).toLocaleString()}] ${t.label}`);
        lines.push(`  ${t.description}`);
        lines.push("");
      }
    }

    // Full event details
    lines.push("======================================================");
    lines.push("FULL EVENT DETAILS");
    lines.push("======================================================");
    if (incidents.length === 0) {
      lines.push("(no events logged)");
    } else {
      const ordered = [...incidents].sort((a: any, b: any) => +new Date(a.occurred_at) - +new Date(b.occurred_at));
      for (const i of ordered as any[]) {
        lines.push(`---`);
        lines.push(`Title: ${i.title}`);
        lines.push(`When: ${new Date(i.occurred_at).toLocaleString()}`);
        if (i.who_involved) lines.push(`Who: ${i.who_involved}`);
        if (i.location) lines.push(`Location: ${i.location}`);
        lines.push(`What happened:`);
        lines.push(i.what_happened ?? "");
        if (i.notes) {
          lines.push(`Notes:`);
          lines.push(i.notes);
        }
        lines.push("");
      }
    }

    lines.push("------------------------------------------------------");
    lines.push("This export is for personal record-keeping. Not legal advice.");

    // ---- Assemble zip ----
    const zip = new JSZip();
    zip.file("summary.txt", lines.join("\n"));

    const evidenceFolder = zip.folder("evidence");
    if (evidenceFolder && docs.length > 0) {
      // Fetch each evidence file via signed URL, add to zip
      const usedNames = new Set<string>();
      for (const d of docs as any[]) {
        try {
          const { data: signed, error: sErr } = await supabase.storage
            .from("case-documents")
            .createSignedUrl(d.storage_path, 300);
          if (sErr || !signed) continue;
          const res = await fetch(signed.signedUrl);
          if (!res.ok) continue;
          const blob = await res.blob();

          // Prefer display name (preserve extension from original file_name)
          const originalExt = d.file_name?.includes(".") ? d.file_name.split(".").pop() : "";
          let name = d.display_name
            ? sanitize(d.display_name) + (d.display_name.includes(".") ? "" : (originalExt ? `.${originalExt}` : ""))
            : sanitize(d.file_name ?? `evidence-${d.id}`);

          // Avoid name collisions
          let unique = name;
          let n = 1;
          while (usedNames.has(unique)) {
            const dot = name.lastIndexOf(".");
            unique = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
            n++;
          }
          usedNames.add(unique);
          evidenceFolder.file(unique, blob);
        } catch (err) {
          console.warn("export: failed to add evidence", d.id, err);
        }
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pull-up-receipts-${sanitize(partyName)}-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Export ready", { id: toastId });
  } catch (err) {
    console.error("exportCaseZip failed", err);
    toast.error(err instanceof Error ? err.message : "Export failed", { id: toastId });
  }
}
