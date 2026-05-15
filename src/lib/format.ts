// Shared display formatters. Use these everywhere to keep dates,
// file sizes, and other primitive values consistent across the app.
import { format, parseISO } from "date-fns";

/** Human-friendly file size: "812 B", "12.4 KB", "3.7 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes == null || isNaN(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Long, friendly date: "March 14, 2026". Use for entry headers. */
export function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMMM d, yyyy"); } catch { return "—"; }
}

/** Short, friendly date: "Mar 14, 2026". Default in lists/cards. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy"); } catch { return "—"; }
}

/** Compact: "Mar 14". Used in tight metric tiles. */
export function formatDateCompact(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d"); } catch { return "—"; }
}

/** Date + time: "Mar 14, 2026 at 4:32 PM". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "MMM d, yyyy 'at' h:mm a"); } catch { return "—"; }
}

/** Day grouping header: "Saturday, Mar 14, 2026". */
export function formatDayHeading(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "EEEE, MMM d, yyyy"); } catch { return "—"; }
}
