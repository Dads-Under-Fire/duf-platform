import type { Tables, TablesInsert, Enums } from "@/integrations/supabase/types";

export type Case = Tables<"cases">;
export type CaseInsert = TablesInsert<"cases">;

export type CaseLogEntry = Tables<"case_log_entries">;
export type CaseLogEntryInsert = TablesInsert<"case_log_entries">;

export type CaseLogAttachment = Tables<"case_log_attachments">;
export type CaseLogAttachmentInsert = TablesInsert<"case_log_attachments">;

export type CaseLogEntryType = Enums<"case_log_entry_type">;

export const ENTRY_TYPE_LABELS: Record<CaseLogEntryType, string> = {
  general_incident: "General incident",
  parenting_time_exchange: "Parenting time / exchange",
  communication: "Communication",
  medical: "Medical",
  school_daycare: "School / daycare",
  expense: "Expense",
};

export const COMMUNICATION_METHODS = [
  "text_message",
  "email",
  "phone_call",
  "in_person",
  "video_call",
  "messaging_app",
  "other",
] as const;

export const COMMUNICATION_METHOD_LABELS: Record<typeof COMMUNICATION_METHODS[number], string> = {
  text_message: "Text message",
  email: "Email",
  phone_call: "Phone call",
  in_person: "In person",
  video_call: "Video call",
  messaging_app: "Messaging app",
  other: "Other",
};

export const COMMUNICATION_PARTIES = [
  "co_parent",
  "attorney",
  "mediator",
  "school",
  "doctor",
  "therapist",
  "other",
] as const;

export const COMMUNICATION_PARTY_LABELS: Record<typeof COMMUNICATION_PARTIES[number], string> = {
  co_parent: "Co-parent",
  attorney: "Attorney",
  mediator: "Mediator",
  school: "School",
  doctor: "Doctor",
  therapist: "Therapist",
  other: "Other",
};

export interface CommunicationMetadata {
  communication_method?: string;
  communication_party?: string;
  communication_summary?: string;
}
