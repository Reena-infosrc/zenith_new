/** IST display for report views and submission history (matches Client RM feedback tab). */
const INDIA_TIMEZONE = "Asia/Kolkata";
const INDIA_LOCALE = "en-IN";

export function formatDateTimeInIndia(value?: string | null): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString(INDIA_LOCALE, {
      timeZone: INDIA_TIMEZONE,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return "—";
  }
}
