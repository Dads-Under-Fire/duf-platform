import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CaseLogEntryInsert } from "@/types/caseLog";

interface SaveEntryParams {
  entry: Omit<CaseLogEntryInsert, "user_id">;
  files?: File[];
  evidenceNote?: string;
}

interface UpdateEntryParams {
  entryId: string;
  entry: Partial<Omit<CaseLogEntryInsert, "user_id" | "case_id">>;
  files?: File[];
  evidenceNote?: string;
}

export function useRecentCaseLogEntries(caseId: string | null, limit = 5) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["case_log_entries", "recent", caseId, limit],
    enabled: !!user && !!caseId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_log_entries")
        .select("*")
        .eq("case_id", caseId!)
        .eq("user_id", user!.id)
        .order("event_date", { ascending: false })
        .order("event_time", { ascending: false })
        .limit(limit);
      if (error) throw error;

      // Fetch attachment counts
      const entryIds = data.map((e) => e.id);
      if (entryIds.length === 0) return data.map((e) => ({ ...e, attachment_count: 0 }));

      const { data: attachments, error: attError } = await supabase
        .from("case_log_attachments")
        .select("case_log_entry_id")
        .in("case_log_entry_id", entryIds);

      const countMap: Record<string, number> = {};
      if (!attError && attachments) {
        attachments.forEach((a) => {
          countMap[a.case_log_entry_id] = (countMap[a.case_log_entry_id] || 0) + 1;
        });
      }

      return data.map((e) => ({ ...e, attachment_count: countMap[e.id] || 0 }));
    },
  });
}

export function useCreateCaseLogEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ entry, files, evidenceNote }: SaveEntryParams) => {
      if (!user) throw new Error("Not authenticated");

      const { data: savedEntry, error: entryError } = await supabase
        .from("case_log_entries")
        .insert({ ...entry, user_id: user.id })
        .select()
        .single();
      if (entryError) throw entryError;

      const attachmentErrors: string[] = [];

      if (files && files.length > 0 && savedEntry) {
        for (const file of files) {
          const uniqueId = crypto.randomUUID();
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${user.id}/${savedEntry.case_id}/${savedEntry.id}/${uniqueId}-${sanitizedName}`;

          const { error: uploadError } = await supabase.storage
            .from("case-log-attachments")
            .upload(storagePath, file, { contentType: file.type, upsert: false });

          if (uploadError) {
            attachmentErrors.push(`${file.name}: ${uploadError.message}`);
            continue;
          }

          const { error: attachError } = await supabase
            .from("case_log_attachments")
            .insert({
              user_id: user.id,
              case_id: savedEntry.case_id,
              case_log_entry_id: savedEntry.id,
              file_path: storagePath,
              file_name: file.name,
              file_type: file.type,
              file_size_bytes: file.size,
              evidence_note: evidenceNote?.trim() || null,
            });

          if (attachError) {
            attachmentErrors.push(`${file.name}: record error`);
          }
        }
      }

      return {
        entry: savedEntry,
        attachmentError: attachmentErrors.length > 0 ? attachmentErrors.join("; ") : null,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case_log_entries"] });
    },
  });
}

export function useUpdateCaseLogEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ entryId, entry, files, evidenceNote }: UpdateEntryParams) => {
      if (!user) throw new Error("Not authenticated");

      const { data: updatedEntry, error: updateError } = await supabase
        .from("case_log_entries")
        .update({ ...entry, updated_at: new Date().toISOString() })
        .eq("id", entryId)
        .eq("user_id", user.id)
        .select()
        .single();
      if (updateError) throw updateError;

      // Upload any new files (existing attachments are preserved)
      const attachmentErrors: string[] = [];

      if (files && files.length > 0 && updatedEntry) {
        for (const file of files) {
          const uniqueId = crypto.randomUUID();
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${user.id}/${updatedEntry.case_id}/${updatedEntry.id}/${uniqueId}-${sanitizedName}`;

          const { error: uploadError } = await supabase.storage
            .from("case-log-attachments")
            .upload(storagePath, file, { contentType: file.type, upsert: false });

          if (uploadError) {
            attachmentErrors.push(`${file.name}: ${uploadError.message}`);
            continue;
          }

          const { error: attachError } = await supabase
            .from("case_log_attachments")
            .insert({
              user_id: user.id,
              case_id: updatedEntry.case_id,
              case_log_entry_id: updatedEntry.id,
              file_path: storagePath,
              file_name: file.name,
              file_type: file.type,
              file_size_bytes: file.size,
              evidence_note: evidenceNote?.trim() || null,
            });

          if (attachError) {
            attachmentErrors.push(`${file.name}: record error`);
          }
        }
      }

      return {
        entry: updatedEntry,
        attachmentError: attachmentErrors.length > 0 ? attachmentErrors.join("; ") : null,
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case_log_entries"] });
    },
  });
}

export function useDeleteCaseLogEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ entryId, caseId }: { entryId: string; caseId: string }) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Get all attachments for this entry
      const { data: attachments } = await supabase
        .from("case_log_attachments")
        .select("id, file_path")
        .eq("case_log_entry_id", entryId)
        .eq("user_id", user.id);

      // 2. Delete files from storage
      if (attachments && attachments.length > 0) {
        const paths = attachments.map((a) => a.file_path);
        await supabase.storage.from("case-log-attachments").remove(paths);
      }

      // 3. Delete attachment records
      await supabase
        .from("case_log_attachments")
        .delete()
        .eq("case_log_entry_id", entryId)
        .eq("user_id", user.id);

      // 4. Delete the entry
      const { error } = await supabase
        .from("case_log_entries")
        .delete()
        .eq("id", entryId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case_log_entries"] });
    },
  });
}

export function useDeleteAttachment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ attachmentId, filePath }: { attachmentId: string; filePath: string }) => {
      if (!user) throw new Error("Not authenticated");

      await supabase.storage.from("case-log-attachments").remove([filePath]);

      const { error } = await supabase
        .from("case_log_attachments")
        .delete()
        .eq("id", attachmentId)
        .eq("user_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case_log_entries"] });
      queryClient.invalidateQueries({ queryKey: ["case_log_attachments"] });
    },
  });
}
