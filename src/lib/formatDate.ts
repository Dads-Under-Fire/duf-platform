/**
 * Timezone-aware date formatting utilities.
 * Always renders dates in the user's local IANA timezone, with the abbreviated
 * timezone name appended so the reset moment is unambiguous.
 */

function getTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function getTimeZoneAbbr(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone,
      timeZoneName: "short",
    }).formatToParts(date);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** "May 14, 2026 (PDT)" — full date with timezone abbreviation. */
export function formatResetDate(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tz = getTimeZone();
  const datePart = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
  const abbr = getTimeZoneAbbr(date, tz);
  return abbr ? `${datePart} (${abbr})` : datePart;
}

/** "May 14 (PDT)" — short date for compact UI like the TopBar. */
export function formatResetDateShort(value: string | Date | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const tz = getTimeZone();
  const datePart = new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(date);
  const abbr = getTimeZoneAbbr(date, tz);
  return abbr ? `${datePart} (${abbr})` : datePart;
}
