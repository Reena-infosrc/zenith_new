/**
 * Single source of truth for Monthly feedback rating labels (1–5 in API).
 * Mirrors the manager submit form (`ClientRMFeedbackTab` rating matrices + overall stars).
 */

export const WORK_PERFORMANCE_SCALE: { value: number; label: string }[] = [
  { value: 1, label: "Poor" },
  { value: 2, label: "Needs Improvement" },
  { value: 3, label: "Meets Expectations" },
  { value: 4, label: "Exceeds Expectations" },
  { value: 5, label: "Outstanding" },
];

export const COMMUNICATION_COLLABORATION_SCALE: { value: number; label: string }[] = [
  { value: 1, label: "Limited Effectiveness" },
  { value: 2, label: "Developing" },
  { value: 3, label: "Meets Expectations" },
  { value: 4, label: "Exceeds Expectations" },
  { value: 5, label: "Exceptional" },
];

/** 0 = missing / not rated; 1–5 = valid stored values. */
export function clampRatingStored(value: number): number {
  const n = Math.round(Number(value));
  if (Number.isNaN(n)) return 0;
  if (n < 1) return 0;
  if (n > 5) return 5;
  return n;
}

export function labelForWorkPerformanceRating(value: number): string {
  const v = clampRatingStored(value);
  if (!v) return "—";
  return WORK_PERFORMANCE_SCALE.find((x) => x.value === v)?.label ?? "—";
}

export function labelForCommunicationRating(value: number): string {
  const v = clampRatingStored(value);
  if (!v) return "—";
  return COMMUNICATION_COLLABORATION_SCALE.find((x) => x.value === v)?.label ?? "—";
}

/**
 * Work-performance text for CSV / Microsoft Forms–style reports (plural “Expectations” on 3–4).
 * Use for matrix criteria as text; overall satisfaction column in CSV stays numeric 1–5.
 */
export function csvExportLabelForWorkPerformanceRating(value: number): string {
  const v = clampRatingStored(value);
  if (!v) return "—";
  const map: Record<number, string> = {
    1: "Poor",
    2: "Needs Improvement",
    3: "Meets Expectations",
    4: "Exceeds Expectations",
    5: "Outstanding",
  };
  return map[v] ?? "—";
}

/** Communication & collaboration criteria — same labels as the live form scale (text, not 1–5). */
export function csvExportLabelForCommunicationRating(value: number): string {
  return labelForCommunicationRating(value);
}

/** Aligns with the prior overall dropdown copy (stars-only control in the form). */
export function labelForOverallSatisfaction(value: number): string {
  const v = clampRatingStored(value);
  if (!v) return "—";
  if (v <= 2) return "Needs improvement";
  if (v === 3) return "Meets expectations";
  return "Exceeds expectations";
}
