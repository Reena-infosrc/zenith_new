import { type ReactNode } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  clampRatingStored,
  labelForCommunicationRating,
  labelForOverallSatisfaction,
  labelForWorkPerformanceRating,
} from "@/lib/client-rm-feedback-rating-scales";

/** Section card for read-only report / dashboard detail views. */
export function ReportDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <h4 className="text-[15px] font-semibold tracking-tight text-foreground">{title}</h4>
      </div>
      <div className="px-5 pb-5">{children}</div>
    </div>
  );
}

/** Label (key) above a bordered value — clear hierarchy in reports. */
export function ReportKV({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="text-sm font-medium text-foreground min-h-[1.5rem] flex items-center">
        {value}
      </div>
      {sub ? <p className="text-xs text-muted-foreground/80">{sub}</p> : null}
    </div>
  );
}

/** Responsive scale: comfortable on laptop, not oversized on large monitors. */
export const REPORT_PAGE_TITLE = "text-xl sm:text-2xl font-bold tracking-tight text-foreground";
export const REPORT_CARD_TITLE = "text-base sm:text-lg font-bold tracking-tight text-foreground";
export const REPORT_CARD_HEADER_BAND = "space-y-2 border-b border-border/70 bg-muted/35 py-3 sm:py-4";

/** Criterion / question line above a rating answer in read-only reports. */
export const REPORT_RATING_QUESTION_CLASS =
  "text-sm font-medium leading-snug text-muted-foreground";

/**
 * Read-only: only the submitted answer text (same labels as the form scales), no scale UI.
 */
export function SubmittedRatingRead({
  value,
  variant,
}: {
  value: number;
  variant: "work" | "communication";
}) {
  const v = clampRatingStored(value);
  if (!v) {
    return <span className="text-base font-medium text-muted-foreground">—</span>;
  }
  const text =
    variant === "work" ? labelForWorkPerformanceRating(v) : labelForCommunicationRating(v);

  /** Answer only: stronger weight/size than {@link REPORT_RATING_QUESTION_CLASS} criterion titles. */
  return <p className="text-base font-semibold leading-snug text-foreground">{text}</p>;
}

/** Matches the form’s 1–5 star control: filled stars + short summary line (read-only). */
export function OverallSatisfactionReadOnly({ value }: { value: number }) {
  const v = clampRatingStored(value);
  if (!v) {
    return <span className="text-sm font-medium text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
      <div
        className="inline-flex w-fit items-center gap-0.5 rounded-xl border-2 border-border/70 bg-gradient-to-b from-muted/40 to-background px-2 py-2 shadow-inner"
        aria-hidden
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <Star
            key={i}
            className={cn(
              "h-7 w-7 sm:h-8 sm:w-8",
              i <= v ? "fill-amber-400 text-amber-500 drop-shadow-sm" : "text-muted-foreground/25"
            )}
          />
        ))}
      </div>
      <div className="space-y-1">
        <p className="text-base font-semibold text-foreground leading-snug">{labelForOverallSatisfaction(v)}</p>
        <p className="text-xs font-medium tabular-nums text-muted-foreground">{v} of 5</p>
      </div>
    </div>
  );
}
