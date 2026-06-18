import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { showAchievement } from "@/lib/achievements";
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

  // Achievement: first lease (rental) or offer letter (employment) uploaded to this case.
  try {
    const lower = file.name.toLowerCase();
    const looksLikeLease = lower.includes("lease");
    const looksLikeOffer = lower.includes("offer") || lower.includes("contract") || lower.includes("employment");
    if (looksLikeLease || looksLikeOffer) {
      const { data: caseRow } = await supabase
        .from("cases")
        .select("module, dispute_type")
        .eq("id", caseId)
        .maybeSingle();
      const mod = (caseRow?.module || caseRow?.dispute_type || "") as string;
      const isRenting = mod === "landlord_tenant";
      const isEmployment = mod === "employer_employee";
      const { data: prior } = await supabase
        .from("documents")
        .select("id, file_name, detected_type")
        .eq("case_id", caseId)
        .neq("id", insertedDoc!.id);
      const matcher = (d: { file_name: string | null; detected_type: string | null }) => {
        const n = (d.file_name || "").toLowerCase();
        const t = (d.detected_type || "").toLowerCase();
        if (isRenting) return n.includes("lease") || t.includes("lease");
        if (isEmployment) return n.includes("offer") || n.includes("contract") || n.includes("employment")
          || t.includes("offer") || t.includes("contract") || t.includes("employment");
        return false;
      };
      const alreadyHad = (prior ?? []).some(matcher);
      if (!alreadyHad) {
        if (isRenting && looksLikeLease) {
          showAchievement("lease-uploaded", "Lease uploaded. Your companion's already looked it over.");
        } else if (isEmployment && looksLikeOffer) {
          showAchievement("offer-uploaded", "Offer letter uploaded. Your companion's already looked it over.");
        }
      }
    }
  } catch {
    // achievement is best-effort
  }

  return insertedDoc ? { id: insertedDoc.id } : null;
}
