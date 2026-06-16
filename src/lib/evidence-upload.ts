import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FREE_STORAGE_BYTES } from "@/lib/constants";

export const EVIDENCE_ACCEPT = "image/*,application/pdf,.doc,.docx,.txt,.eml,.msg";

/**
 * Shared evidence upload routine used by every entry point that uploads
 * an evidence file for a File (Evidence Vault tab, Overview tab, etc.).
 * Keeps storage path convention, free-tier guard, DB insert, and analysis
 * trigger identical across the app.
 */
export async function uploadEvidence(params: {
  file: File;
  caseId: string;
}): Promise<{ id: string } | null> {
  const { file, caseId } = params;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    toast.error("Not signed in");
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("subscription_tier")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.subscription_tier === "free") {
    const { data: existing } = await supabase
      .from("documents")
      .select("file_size")
      .eq("user_id", user.id);
    const used = (existing ?? []).reduce((s, d) => s + (d.file_size ?? 0), 0);
    if (used + file.size > FREE_STORAGE_BYTES) {
      toast.error("You've reached the 75MB free storage cap. Upgrade for unlimited storage.");
      return null;
    }
  }

  const path = `${user.id}/${caseId}/${Date.now()}-${file.name}`;
  const { error: upErr } = await supabase.storage
    .from("case-documents")
    .upload(path, file, { contentType: file.type });
  if (upErr) {
    toast.error(upErr.message);
    return null;
  }

  const { data: insertedDoc, error: dbErr } = await supabase
    .from("documents")
    .insert({
      case_id: caseId,
      user_id: user.id,
      file_name: file.name,
      storage_path: path,
      file_size: file.size,
      mime_type: file.type,
    })
    .select()
    .single();

  if (dbErr) {
    toast.error(dbErr.message);
    return null;
  }
  return insertedDoc ? { id: insertedDoc.id } : null;
}
