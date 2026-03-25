import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CaseLogEntryInsert } from "@/types/caseLog";

interface SaveEntryParams {
  entry: Omit<CaseLogEntryInsert, "user_id">;
  file?: File | null;
  evidenceNote?: string;
}

export function useCreateCaseLogEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ entry, file, evidenceNote }: SaveEntryParams) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Save the entry
      const { data: savedEntry, error: entryError } = await supabase
        .from("case_log_entries")
        .insert({ ...entry, user_id: user.id })
        .select()
        .single();
      if (entryError) throw entryError;

      // 2. Upload file + create attachment record if file provided
      if (file && savedEntry) {
        const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
        const storagePath = `${user.id}/${savedEntry.case_id}/${savedEntry.id}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("case-log-attachments")
          .upload(storagePath, file, {
            contentType: file.type,
            upsert: false,
          });

        if (uploadError) {
          // Entry saved but upload failed — don't throw, but note it
          console.error("Attachment upload failed:", uploadError);
          return { entry: savedEntry, attachmentError: uploadError.message };
        }

        // 3. Create attachment row
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
          console.error("Attachment record failed:", attachError);
          return { entry: savedEntry, attachmentError: attachError.message };
        }
      }

      return { entry: savedEntry, attachmentError: null };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case_log_entries"] });
    },
  });
}
