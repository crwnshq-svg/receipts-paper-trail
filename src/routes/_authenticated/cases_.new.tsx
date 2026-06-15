import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/cases_/new")({
  head: () => ({ meta: [{ title: "Start a File — Pull Up Receipts" }] }),
  component: NewCase,
});

function NewCase() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [disputeType, setDisputeType] = useState<string>("landlord_tenant");
  const [opposingParty, setOpposingParty] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { data, error } = await supabase.from("cases").insert({
        user_id: user.id,
        title,
        dispute_type: disputeType as never,
        opposing_party: opposingParty || null,
        description: description || null,
      }).select().single();
      if (error) throw error;
      toast.success("Record started");
      navigate({ to: "/cases/$caseId", params: { caseId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start record");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-xl">
        <h1 className="font-serif text-3xl font-semibold">Start a Record</h1>
        <p className="mt-1 text-sm text-muted-foreground">Begin a paper trail. You can promote it to a formal Case later when the situation escalates.</p>

        <Card className="mt-6 p-6">
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} required
                placeholder="e.g. Apartment 4B — habitability dispute" />
            </div>

            <div className="space-y-1.5">
              <Label>Dispute type</Label>
              <Select value={disputeType} onValueChange={setDisputeType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="landlord_tenant">Landlord / Tenant</SelectItem>
                  <SelectItem value="employer_employee">Employer / Employee</SelectItem>
                  <SelectItem value="neighbor">Neighbor</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Opposing party (optional)</Label>
              <Input value={opposingParty} onChange={(e) => setOpposingParty(e.target.value)}
                placeholder="Name of person, company, or organization" />
            </div>

            <div className="space-y-1.5">
              <Label>Description (optional)</Label>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of the situation" rows={4} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => navigate({ to: "/cases" })}>Cancel</Button>
              <Button type="submit" disabled={loading || !title} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {loading ? "Starting…" : "Start Record"}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
