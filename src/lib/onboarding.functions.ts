import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { createLovableAiGatewayProvider, SUMMARY_MODEL } from "./ai-gateway.server";

const InferInput = z.object({
  module: z.enum(["landlord_tenant", "employer_employee"]),
  text: z.string().min(1).max(4000),
});

const LANDLORD_SUBTYPES = [
  "Repair request ignored",
  "Landlord entered without notice",
  "Deposit dispute",
  "Habitability issue",
  "Retaliation",
  "Lease violation",
];
const EMPLOYMENT_SUBTYPES = [
  "Wages not paid correctly",
  "Hostile work environment",
  "Wrongful discipline",
  "Retaliation",
  "Wrongful termination",
  "Hours or scheduling issue",
];

export const inferOnboardingFields = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InferInput.parse(d))
  .handler(async ({ data }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { sub_type: null as string | null, key_details: [] as string[] };

    const subTypes = data.module === "landlord_tenant" ? LANDLORD_SUBTYPES : EMPLOYMENT_SUBTYPES;
    const system = `You read a user's short description of their ${
      data.module === "landlord_tenant" ? "rental / housing" : "job / workplace"
    } situation and infer a likely category and a few key details.

Reply ONLY with valid JSON, no markdown:
{
  "sub_type": one of ${JSON.stringify(subTypes)} or null if nothing clearly fits,
  "key_details": array of 0-3 short noun-phrase tags pulled from the text (e.g. "mold in bathroom", "owed 2 weeks pay", "unpaid overtime"). Each tag <= 6 words. Empty array if nothing specific.
}`;

    try {
      const gateway = createLovableAiGatewayProvider(apiKey);
      const { text } = await generateText({
        model: gateway(SUMMARY_MODEL),
        system,
        prompt: data.text,
      });
      let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
      const s = t.indexOf("{");
      const e = t.lastIndexOf("}");
      if (s === -1 || e === -1) throw new Error("no json");
      const obj = JSON.parse(t.slice(s, e + 1));
      const sub_type =
        typeof obj.sub_type === "string" && subTypes.includes(obj.sub_type) ? obj.sub_type : null;
      const key_details = Array.isArray(obj.key_details)
        ? obj.key_details
            .filter((x: unknown): x is string => typeof x === "string" && x.trim().length > 0)
            .slice(0, 3)
            .map((s: string) => s.trim())
        : [];
      return { sub_type, key_details };
    } catch (err) {
      console.warn("inferOnboardingFields failed", err);
      return { sub_type: null as string | null, key_details: [] as string[] };
    }
  });
