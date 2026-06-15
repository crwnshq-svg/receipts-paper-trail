import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, Upload, X, FileText } from "lucide-react";
import { toast } from "sonner";
import { FREE_STORAGE_BYTES } from "@/lib/constants";
import { analyzeDocument } from "@/lib/document-intelligence.functions";

type Doc = { id: string; file_name: string; display_name?: string | null };

export function AttachDocs({
  caseId,
  value,
  onChange,
}: {
  caseId: string;
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const analyze = useServerFn(analyzeDocument);

  const { data: docs = [], refetch } = useQuery({
    queryKey: ["documents-picker", caseId],
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, file_name, display_name")
        .eq("case_id", caseId)
        .order("created_at", { ascending: false });
      return (data ?? []) as Doc[];
    },
  });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return docs;
    return docs.filter((d) =>
      (d.display_name ?? d.file_name).toLowerCase().includes(q),
    );
  }, [docs, query]);

  const attached = useMemo(
    () => docs.filter((d) => value.includes(d.id)),
    [docs, value],
  );

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

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
        const used = (existing ?? []).reduce(
          (s, d) => s + (d.file_size ?? 0),
          0,
        );
        if (used + file.size > FREE_STORAGE_BYTES) {
          toast.error(
            "You've reached the 75MB free storage cap. Upgrade for unlimited storage.",
          );
          return;
        }
      }

      const path = `${user.id}/${caseId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("case-documents")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;

      const { data: inserted, error: dbErr } = await supabase
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
      if (dbErr) throw dbErr;

      toast.success("Uploaded & attached");
      onChange([...value, inserted.id]);
      await refetch();
      analyze({ data: { documentId: inserted.id } }).catch(() => {});
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              <Paperclip className="mr-1.5 h-3.5 w-3.5" /> Attach from Evidence Vault
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="start">
            <Input
              placeholder="Search evidence…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-sm"
            />
            <div className="mt-2 max-h-60 overflow-auto">
              {filtered.length === 0 ? (
                <div className="px-2 py-6 text-center text-xs text-muted-foreground">
                  No evidence in your Evidence Vault yet.
                </div>
              ) : (
                <ul className="space-y-0.5">
                  {filtered.map((d) => {
                    const checked = value.includes(d.id);
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => toggle(d.id)}
                          className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary ${checked ? "bg-secondary" : ""}`}
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="flex-1 truncate">
                            {d.display_name ?? d.file_name}
                          </span>
                          {checked && (
                            <span className="text-[10px] text-accent">✓</span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        <input
          ref={fileRef}
          type="file"
          hidden
          onChange={onUpload}
          accept="image/*,application/pdf,.doc,.docx,.txt,.eml,.msg"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />{" "}
          {uploading ? "Uploading…" : "Upload New"}
        </Button>
      </div>

      {attached.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {attached.map((d) => (
            <div
              key={d.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs"
            >
              <FileText className="h-3 w-3 text-muted-foreground" />
              <span className="max-w-[180px] truncate">
                {d.display_name ?? d.file_name}
              </span>
              <button
                type="button"
                onClick={() => toggle(d.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AttachedDocsRow({
  caseId,
  ids,
}: {
  caseId: string;
  ids: string[];
}) {
  const { data: docs = [] } = useQuery({
    queryKey: ["documents-attached", caseId, ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, file_name, display_name")
        .in("id", ids);
      return (data ?? []) as Doc[];
    },
  });

  if (!ids || ids.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {docs.map((d) => (
        <div
          key={d.id}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground"
        >
          <FileText className="h-3 w-3" />
          <span className="max-w-[180px] truncate">
            {d.display_name ?? d.file_name}
          </span>
        </div>
      ))}
    </div>
  );
}
