import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { CaseLogEntryInsert } from "@/types/caseLog";

interface SaveEntryParams {
  entry: Omit<CaseLogEntryInsert, "user_id">;
  files?: File[];
  evidenceNote?: string;
}

export function useCreateCaseLogEntry() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ entry, files, evidenceNote }: SaveEntryParams) => {
      if (!user) throw new Error("Not authenticated");

      // 1. Save the entry
      const { data: savedEntry, error: entryError } = await supabase
        .from("case_log_entries")
        .insert({ ...entry, user_id: user.id })
        .select()
        .single();
      if (entryError) throw entryError;

      // 2. Upload files + create attachment records
      const attachmentErrors: string[] = [];

      if (files && files.length > 0 && savedEntry) {
        for (const file of files) {
          const fileExt = file.name.split(".").pop()?.toLowerCase() || "bin";
          const uniqueId = crypto.randomUUID();
          const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
          const storagePath = `${user.id}/${savedEntry.case_id}/${savedEntry.id}/${uniqueId}-${sanitizedName}`;

          const { error: uploadError } = await supabase.storage
            .from("case-log-attachments")
            .upload(storagePath, file, {
              contentType: file.type,
              upsert: false,
            });

          if (uploadError) {
            console.error("Attachment upload failed:", uploadError);
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
            console.error("Attachment record failed:", attachError);
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
