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

// --- Communication ---

export const COMMUNICATION_METHODS = [
  "text_imessage",
  "email",
  "court_ordered_app",
  "phone",
  "voicemail",
  "in_person",
  "third_party",
  "other",
] as const;

export type CommunicationMethod = typeof COMMUNICATION_METHODS[number];

export const COMMUNICATION_METHOD_LABELS: Record<CommunicationMethod, string> = {
  text_imessage: "Text / iMessage",
  email: "Email",
  court_ordered_app: "Court-ordered app",
  phone: "Phone",
  voicemail: "Voicemail",
  in_person: "In person",
  third_party: "Third party",
  other: "Other",
};

export const COMMUNICATION_PARTIES = [
  "other_parent",
  "daycare",
  "school",
  "doctor_provider",
  "attorney",
  "family_member",
  "other",
] as const;

export type CommunicationParty = typeof COMMUNICATION_PARTIES[number];

export const COMMUNICATION_PARTY_LABELS: Record<CommunicationParty, string> = {
  other_parent: "Other parent",
  daycare: "Daycare",
  school: "School",
  doctor_provider: "Doctor / provider",
  attorney: "Attorney",
  family_member: "Family member",
  other: "Other",
};

// --- Parenting Time Exchange ---

export const EXCHANGE_OUTCOMES = [
  "completed",
  "late",
  "denied",
  "missed",
  "changed",
] as const;

export type ExchangeOutcome = typeof EXCHANGE_OUTCOMES[number];

export const EXCHANGE_OUTCOME_LABELS: Record<ExchangeOutcome, string> = {
  completed: "Completed",
  late: "Late",
  denied: "Denied",
  missed: "Missed",
  changed: "Changed",
};

// --- School / Daycare ---

export const SCHOOL_ISSUE_TYPES = [
  "pickup_dropoff",
  "payment",
  "attendance",
  "communication",
  "records_access",
  "other",
] as const;

export type SchoolIssueType = typeof SCHOOL_ISSUE_TYPES[number];

export const SCHOOL_ISSUE_TYPE_LABELS: Record<SchoolIssueType, string> = {
  pickup_dropoff: "Pickup / drop-off",
  payment: "Payment",
  attendance: "Attendance",
  communication: "Communication",
  records_access: "Records / access",
  other: "Other",
};

// --- Expense ---

export const EXPENSE_CATEGORIES = [
  "daycare",
  "medical",
  "school",
  "extracurricular",
  "transportation",
  "other",
] as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number];

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  daycare: "Daycare",
  medical: "Medical",
  school: "School",
  extracurricular: "Extracurricular",
  transportation: "Transportation",
  other: "Other",
};

// --- Metadata shapes ---

export interface CommunicationMetadata {
  method?: string;
  contact?: string;
  summary?: string;
}

export interface ParentingTimeExchangeMetadata {
  scheduled_exchange_time?: string;
  actual_exchange_time?: string;
  outcome?: string;
}

export interface MedicalMetadata {
  provider_location?: string;
  issue_symptoms?: string;
  other_parent_informed?: boolean;
}

export interface SchoolDaycareMetadata {
  school_daycare_name?: string;
  issue_type?: string;
}

export interface ExpenseMetadata {
  amount?: number;
  expense_category?: string;
}

export interface EntryMetadata {
  communication?: CommunicationMetadata;
  parenting_time_exchange?: ParentingTimeExchangeMetadata;
  medical?: MedicalMetadata;
  school_daycare?: SchoolDaycareMetadata;
  expense?: ExpenseMetadata;
}
