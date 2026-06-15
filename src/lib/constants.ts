export const FREE_STORAGE_BYTES = 75 * 1024 * 1024; // 75 MB
export const STORAGE_WARNING_BYTES = 60 * 1024 * 1024; // 60 MB
export const FREE_AI_QUESTIONS = 3;
export const FREE_MAX_CASES = 1;

export const PLAN_MONTHLY_PRICE = 15;
export const PLAN_ANNUAL_PRICE = 150;
export const CASE_PACKAGE_PRICE = 49;
export const CASE_PACKAGE_REGEN_PRICE = 9;
export const CERTIFIED_MAIL_PRICE = 10.99;

export const DISCLAIMER =
  "Pull Up Receipts is a document preparation tool and does not provide legal advice. Nothing generated constitutes legal advice or creates an attorney-client relationship. For legal representation, consult a licensed attorney.";

export const MODULES = {
  landlord_tenant: {
    label: "Landlord / Tenant",
    short: "Disputes with your landlord or property manager.",
    subTypes: [
      "Repair request ignored",
      "Landlord entered without notice",
      "Deposit dispute",
      "Habitability issue",
      "Retaliation",
      "Lease violation",
    ],
  },
  employer_employee: {
    label: "Employer / Employee",
    short: "Workplace issues, wages, discrimination, wrongful termination.",
    subTypes: [
      "Wages not paid correctly",
      "Hostile work environment",
      "Wrongful discipline",
      "Retaliation",
      "Wrongful termination",
      "Hours or scheduling issue",
    ],
  },
  other_general: {
    label: "Other / General",
    short:
      "Contractors, neighbors, HOA, personal agreements, consumer disputes.",
    subTypes: [
      "I did work and wasn't paid",
      "Neighbor dispute",
      "HOA or community association",
      "Personal agreement or loan",
      "Roommate conflict",
      "Consumer dispute",
    ],
  },
} as const;

export type ModuleKey = keyof typeof MODULES;
