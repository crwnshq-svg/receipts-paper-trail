import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell, Disclaimer } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Scale,
  Building2,
  FileWarning,
  HandHeart,
  HelpCircle,
  FileText,
  Lock,
  ExternalLink,
  MapPin,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/resources")({
  head: () => ({ meta: [{ title: "Resources — Receipts" }] }),
  component: ResourcesPage,
});

type Item = { title: string; desc: string; url: string; locked?: boolean };
type Section = {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: Item[];
};
type Partner = { name: string; specialty: string; location: string };

type Module = {
  key: string;
  label: string;
  sections: Section[];
  partners: Partner[];
};

const MODULES: Module[] = [
  {
    key: "landlord_tenant",
    label: "Landlord / Tenant",
    sections: [
      {
        key: "rights",
        label: "Know Your Rights",
        icon: Scale,
        items: [
          {
            title: "California Civil Code § 1954 — Landlord Entry",
            desc: "Landlords must give at least 24 hours written notice before entering, except in emergencies.",
            url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1954",
          },
          {
            title: "California Civil Code § 1950.5 — Security Deposits",
            desc: "Landlord must return deposit within 21 days with an itemized statement of deductions.",
            url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1950.5",
          },
          {
            title: "Implied Warranty of Habitability",
            desc: "All residential rentals must meet basic habitability standards regardless of lease terms.",
            url: "https://www.courts.ca.gov/selfhelp-eviction-tenants.htm",
          },
          {
            title: "Tenant Protection Act (AB 1482)",
            desc: "Statewide rent cap and just cause for eviction protections in California.",
            url: "https://landlordtenant.dre.ca.gov/tenant/rent_caps.html",
          },
        ],
      },
      {
        key: "agency",
        label: "Find an Agency",
        icon: Building2,
        items: [
          {
            title: "California Department of Consumer Affairs",
            desc: "State regulator that handles complaints across landlord, contractor, and service disputes.",
            url: "https://www.dca.ca.gov/",
          },
          {
            title: "California Department of Real Estate",
            desc: "Oversees licensed property managers and brokers.",
            url: "https://www.dre.ca.gov/",
          },
          {
            title: "Local Housing Authority Directory (HUD)",
            desc: "Find your local Public Housing Agency for Section 8 and tenant resources.",
            url: "https://www.hud.gov/program_offices/public_indian_housing/pha/contacts",
          },
        ],
      },
      {
        key: "complaint",
        label: "File a Complaint",
        icon: FileWarning,
        items: [
          {
            title: "HUD Housing Discrimination Complaint",
            desc: "File a fair housing complaint under the Fair Housing Act.",
            url: "https://www.hud.gov/program_offices/fair_housing_equal_opp/online-complaint",
          },
          {
            title: "California Civil Rights Department (formerly DFEH)",
            desc: "State-level housing discrimination and harassment complaints.",
            url: "https://calcivilrights.ca.gov/complaintprocess/",
          },
          {
            title: "Local Code Enforcement",
            desc: "Report habitability violations to your city or county code enforcement office.",
            url: "https://www.hcd.ca.gov/",
          },
        ],
      },
      {
        key: "legal",
        label: "Get Legal Help",
        icon: HandHeart,
        items: [
          {
            title: "LawHelpCA",
            desc: "Free legal aid directory for low-income Californians.",
            url: "https://www.lawhelpca.org/",
          },
          {
            title: "Tenants Together",
            desc: "Statewide tenant rights organization with hotline and resources.",
            url: "https://www.tenantstogether.org/",
          },
          {
            title: "Legal Services Corporation Locator",
            desc: "Find a federally funded legal aid office in your state.",
            url: "https://www.lsc.gov/about-lsc/what-legal-aid/get-legal-help",
          },
        ],
      },
      {
        key: "faq",
        label: "FAQ",
        icon: HelpCircle,
        items: [
          {
            title: "Can my landlord enter without notice?",
            desc: "Generally no — most states require 24-hour written notice. Emergencies (fire, flooding) are exceptions.",
            url: "https://www.nolo.com/legal-encyclopedia/free-books/renters-rights-book/chapter6-1.html",
          },
          {
            title: "How long does my landlord have to return my deposit?",
            desc: "In California, 21 days. Most states range from 14 to 60 days. Check your state law.",
            url: "https://www.nolo.com/legal-encyclopedia/free-books/renters-rights-book/chapter15-3.html",
          },
          {
            title: "What is retaliation and how do I prove it?",
            desc: "Adverse action (rent hike, eviction notice) shortly after you complained is presumed retaliation in many states.",
            url: "https://www.nolo.com/legal-encyclopedia/landlord-retaliation-state-laws-protect-tenants-30217.html",
          },
        ],
      },
      {
        key: "templates",
        label: "Document Templates",
        icon: FileText,
        items: [
          {
            title: "Repair Request Letter",
            desc: "Basic template. AI-enhanced version with your case facts requires a paid plan.",
            url: "#",
            locked: true,
          },
          {
            title: "30-Day Notice of Intent to Vacate",
            desc: "Standard tenant move-out notice template.",
            url: "#",
            locked: true,
          },
          {
            title: "Security Deposit Demand Letter",
            desc: "Demand return of wrongfully withheld deposit. AI version cites your jurisdiction.",
            url: "#",
            locked: true,
          },
        ],
      },
    ],
    partners: [
      { name: "Bay Area Tenant Law Group", specialty: "Tenant disputes & evictions", location: "San Francisco, CA" },
      { name: "Housing Rights Center", specialty: "Discrimination & habitability", location: "Los Angeles, CA" },
      { name: "Renters' Defense Collective", specialty: "Deposit & retaliation claims", location: "Oakland, CA" },
    ],
  },
  {
    key: "employer_employee",
    label: "Employer / Employee",
    sections: [
      {
        key: "rights",
        label: "Know Your Rights",
        icon: Scale,
        items: [
          {
            title: "Title VII of the Civil Rights Act",
            desc: "Prohibits employment discrimination based on race, color, religion, sex, or national origin.",
            url: "https://www.eeoc.gov/statutes/title-vii-civil-rights-act-1964",
          },
          {
            title: "Fair Labor Standards Act (FLSA)",
            desc: "Minimum wage, overtime, and recordkeeping requirements.",
            url: "https://www.dol.gov/agencies/whd/flsa",
          },
          {
            title: "California Labor Code § 1102.5 — Whistleblower",
            desc: "Protects employees who report violations from retaliation.",
            url: "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=LAB&sectionNum=1102.5",
          },
        ],
      },
      {
        key: "agency",
        label: "Find an Agency",
        icon: Building2,
        items: [
          {
            title: "U.S. Equal Employment Opportunity Commission (EEOC)",
            desc: "Federal agency that enforces workplace discrimination laws.",
            url: "https://www.eeoc.gov/",
          },
          {
            title: "California Labor Commissioner's Office",
            desc: "Wage claims, retaliation complaints, and labor law enforcement.",
            url: "https://www.dir.ca.gov/dlse/",
          },
          {
            title: "U.S. Department of Labor — Wage and Hour Division",
            desc: "File unpaid wage and overtime complaints.",
            url: "https://www.dol.gov/agencies/whd",
          },
        ],
      },
      {
        key: "complaint",
        label: "File a Complaint",
        icon: FileWarning,
        items: [
          {
            title: "EEOC Online Charge Inquiry",
            desc: "Start a discrimination or harassment charge online.",
            url: "https://publicportal.eeoc.gov/Portal/Login.aspx",
          },
          {
            title: "California Civil Rights Department",
            desc: "State-level employment discrimination complaints (must file within 3 years).",
            url: "https://calcivilrights.ca.gov/complaintprocess/",
          },
          {
            title: "OSHA Whistleblower Complaint",
            desc: "Retaliation for reporting safety violations.",
            url: "https://www.whistleblowers.gov/",
          },
        ],
      },
      {
        key: "legal",
        label: "Get Legal Help",
        icon: HandHeart,
        items: [
          {
            title: "National Employment Lawyers Association",
            desc: "Find a plaintiff-side employment attorney.",
            url: "https://www.nela.org/",
          },
          {
            title: "Workplace Fairness",
            desc: "Free legal information and attorney directory.",
            url: "https://www.workplacefairness.org/",
          },
          {
            title: "Legal Aid at Work",
            desc: "Free legal help for low-income workers on employment issues.",
            url: "https://legalaidatwork.org/",
          },
        ],
      },
      {
        key: "faq",
        label: "FAQ",
        icon: HelpCircle,
        items: [
          {
            title: "Can I be fired for complaining about my manager?",
            desc: "Retaliation for protected activity (complaining about discrimination, safety, wages) is illegal.",
            url: "https://www.eeoc.gov/retaliation",
          },
          {
            title: "What counts as a hostile work environment?",
            desc: "Severe or pervasive conduct based on a protected class that a reasonable person would find hostile.",
            url: "https://www.eeoc.gov/harassment",
          },
          {
            title: "Am I owed overtime?",
            desc: "Non-exempt employees are generally owed 1.5x for hours over 40 per week (federal) or 8 per day (CA).",
            url: "https://www.dol.gov/agencies/whd/overtime",
          },
        ],
      },
      {
        key: "templates",
        label: "Document Templates",
        icon: FileText,
        items: [
          {
            title: "HR Formal Complaint Letter",
            desc: "Submit a written complaint to HR. AI version tailors to your facts.",
            url: "#",
            locked: true,
          },
          {
            title: "Demand for Unpaid Wages",
            desc: "Pre-litigation demand letter for unpaid wages and overtime.",
            url: "#",
            locked: true,
          },
          {
            title: "Request for Personnel File",
            desc: "Statutory request for your full employment file.",
            url: "#",
            locked: true,
          },
        ],
      },
    ],
    partners: [
      { name: "West Coast Employment Law", specialty: "Wrongful termination", location: "Los Angeles, CA" },
      { name: "Workers' Justice Project", specialty: "Wage & hour claims", location: "Sacramento, CA" },
      { name: "Equality Advocates LLP", specialty: "Discrimination & harassment", location: "San Francisco, CA" },
    ],
  },
  {
    key: "other_general",
    label: "Other / General",
    sections: [
      {
        key: "rights",
        label: "Know Your Rights",
        icon: Scale,
        items: [
          {
            title: "Small Claims Court Basics",
            desc: "Most states allow disputes up to $10,000 ($12,500 in CA) without an attorney.",
            url: "https://www.courts.ca.gov/selfhelp-smallclaims.htm",
          },
          {
            title: "Consumer Protection Laws (FTC)",
            desc: "Federal protections against deceptive business practices.",
            url: "https://www.ftc.gov/business-guidance/privacy-security/consumer-protection",
          },
          {
            title: "Contractor License Requirements",
            desc: "Most states require licensing for home improvement work above a threshold.",
            url: "https://www.cslb.ca.gov/",
          },
        ],
      },
      {
        key: "agency",
        label: "Find an Agency",
        icon: Building2,
        items: [
          {
            title: "Better Business Bureau",
            desc: "File complaints against businesses and check ratings.",
            url: "https://www.bbb.org/",
          },
          {
            title: "State Attorney General Consumer Division",
            desc: "Each state AG accepts consumer complaints.",
            url: "https://www.naag.org/find-my-ag/",
          },
          {
            title: "California Contractors State License Board",
            desc: "License lookup and contractor complaint filing.",
            url: "https://www.cslb.ca.gov/Consumers/Filing_A_Complaint/",
          },
        ],
      },
      {
        key: "complaint",
        label: "File a Complaint",
        icon: FileWarning,
        items: [
          {
            title: "FTC Consumer Complaint",
            desc: "Report fraud, scams, and bad business practices.",
            url: "https://reportfraud.ftc.gov/",
          },
          {
            title: "Consumer Financial Protection Bureau",
            desc: "Banking, credit, debt collection complaints.",
            url: "https://www.consumerfinance.gov/complaint/",
          },
          {
            title: "Local Police Non-Emergency",
            desc: "For neighbor disputes involving harassment or property damage.",
            url: "https://www.usa.gov/local-governments",
          },
        ],
      },
      {
        key: "legal",
        label: "Get Legal Help",
        icon: HandHeart,
        items: [
          {
            title: "American Bar Association Free Legal Help",
            desc: "Directory of free and reduced-fee legal services.",
            url: "https://www.americanbar.org/groups/legal_services/flh-home/",
          },
          {
            title: "LawHelp.org",
            desc: "National legal aid directory by state.",
            url: "https://www.lawhelp.org/",
          },
          {
            title: "Small Claims Court Self-Help",
            desc: "Step-by-step guides to file a small claims case.",
            url: "https://www.courts.ca.gov/1062.htm",
          },
        ],
      },
      {
        key: "faq",
        label: "FAQ",
        icon: HelpCircle,
        items: [
          {
            title: "Do I need a lawyer for small claims?",
            desc: "No — small claims is designed to be handled without an attorney.",
            url: "https://www.courts.ca.gov/9742.htm",
          },
          {
            title: "How long do I have to file a claim?",
            desc: "Statutes of limitation vary: contracts 2–6 years, property damage 2–3 years. Check your state.",
            url: "https://www.nolo.com/legal-encyclopedia/statute-of-limitations-state-laws-chart-29941.html",
          },
          {
            title: "Should I send a demand letter first?",
            desc: "Yes. A clear demand letter often resolves disputes and strengthens your case if you file.",
            url: "https://www.nolo.com/legal-encyclopedia/sample-demand-letters-29965.html",
          },
        ],
      },
      {
        key: "templates",
        label: "Document Templates",
        icon: FileText,
        items: [
          {
            title: "General Demand Letter",
            desc: "Universal pre-litigation demand template.",
            url: "#",
            locked: true,
          },
          {
            title: "Cease and Desist",
            desc: "Stop harassing or unauthorized conduct.",
            url: "#",
            locked: true,
          },
          {
            title: "Small Claims Filing Package",
            desc: "Pre-filled forms based on your case facts (paid).",
            url: "#",
            locked: true,
          },
        ],
      },
    ],
    partners: [
      { name: "Neighborhood Legal Clinic", specialty: "Consumer & neighbor disputes", location: "San Diego, CA" },
      { name: "Contractor Disputes Group", specialty: "Construction & home repair", location: "Los Angeles, CA" },
      { name: "Small Claims Coach", specialty: "Pro se court prep", location: "Statewide" },
    ],
  },
];

function ResourcesPage() {
  const [tab, setTab] = useState(MODULES[0].key);

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Resources</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Know your rights. Find the right agency. Get help.
          </p>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full justify-start overflow-x-auto">
            {MODULES.map((m) => (
              <TabsTrigger key={m.key} value={m.key} className="whitespace-nowrap">
                {m.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {MODULES.map((m) => (
            <TabsContent key={m.key} value={m.key} className="mt-4 space-y-6">
              <div className="grid gap-3 md:grid-cols-2">
                {m.sections.map((s) => (
                  <Card key={s.key} className="p-0">
                    <Accordion type="single" collapsible>
                      <AccordionItem value={s.key} className="border-0">
                        <AccordionTrigger className="px-4 py-3 hover:no-underline">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary">
                              <s.icon className="h-4 w-4 text-accent" />
                            </div>
                            <span className="text-sm font-semibold">{s.label}</span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <ul className="space-y-3">
                            {s.items.map((item) => (
                              <li key={item.title} className="border-l-2 border-border pl-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-1.5 text-sm font-medium">
                                      {item.locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                                      {item.title}
                                    </div>
                                    <p className="mt-0.5 text-xs text-muted-foreground">{item.desc}</p>
                                  </div>
                                  {!item.locked && (
                                    <a
                                      href={item.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shrink-0 text-muted-foreground hover:text-accent"
                                      aria-label={`Open ${item.title}`}
                                    >
                                      <ExternalLink className="h-4 w-4" />
                                    </a>
                                  )}
                                </div>
                                {item.locked && (
                                  <p className="mt-1 text-[11px] uppercase tracking-wide text-accent">
                                    AI-enhanced — paid plan
                                  </p>
                                )}
                              </li>
                            ))}
                          </ul>
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  </Card>
                ))}
              </div>

              <div>
                <h2 className="font-serif text-xl font-semibold">Partner Directory</h2>
                <p className="text-xs text-muted-foreground">Vetted partners for hands-on help.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {m.partners.map((p) => (
                    <Card key={p.name} className="p-4">
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{p.specialty}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {p.location}
                      </div>
                      <Button variant="outline" size="sm" className="mt-3 w-full">
                        Contact
                      </Button>
                    </Card>
                  ))}
                </div>
              </div>
            </TabsContent>
          ))}
        </Tabs>

        <Disclaimer className="pt-4" />
      </div>
    </AppShell>
  );
}
