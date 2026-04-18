/**
 * Central routes for Client RM monthly feedback (manager submit + leadership reports).
 * Keeps deep links consistent with Performance view modes and optional tab selection.
 */

type ManagerTab = "my-team" | "my-goals";

function performanceManagerHref(tab?: ManagerTab): string {
  const base = "/performance?view=manager";
  if (!tab) return base;
  return `${base}&tab=${tab}`;
}

/** Where the user arrived from — drives primary "Back" target (allowlisted). */
export type SessionFromHint = "team" | "goals" | "reports";

export const CLIENT_RM_FEEDBACK_ROUTES = {
  home: "/home",
  directory: "/directory",
  performanceUser: "/performance?view=user",
  performanceManager: performanceManagerHref,
  monthlyReports: "/performance/monthly-feedback",
  managerSession: (reporteeId: string, opts?: { from?: SessionFromHint }) => {
    const params = new URLSearchParams();
    params.set("reporteeId", reporteeId);
    if (opts?.from) params.set("from", opts.from);
    return `/performance/monthly-rm-feedback?${params.toString()}`;
  },
} as const;

export function parseSessionFromHint(value: string | null): SessionFromHint | null {
  if (value === "team" || value === "goals" || value === "reports") return value;
  return null;
}

export function resolveSessionBackHref(fromHint: SessionFromHint | null): string {
  switch (fromHint) {
    case "reports":
      return CLIENT_RM_FEEDBACK_ROUTES.monthlyReports;
    case "goals":
      return CLIENT_RM_FEEDBACK_ROUTES.performanceManager("my-goals");
    case "team":
    default:
      return CLIENT_RM_FEEDBACK_ROUTES.performanceManager();
  }
}

export function sessionPrimaryBackButtonLabel(fromHint: SessionFromHint | null): string {
  switch (fromHint) {
    case "reports":
      return "Back to monthly feedback reports";
    case "goals":
      return "Back to My Goals";
    case "team":
    default:
      return "Back to Performance";
  }
}
