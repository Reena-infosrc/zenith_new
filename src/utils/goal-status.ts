/** Normalize API / UI goal status strings for comparisons. */
export function normalizeGoalStatus(status: string | undefined): string {
  const raw = (status || "").toLowerCase().trim().replace(/\s+/g, "_");
  if (raw === "pending_manager_approval" || raw === "pending_approval" || raw === "pending-manager-approval") {
    return "pending_manager_approval";
  }
  if (raw === "pending") return "pending";
  if (raw === "in_progress" || raw === "inprogress") return "in_progress";
  if (raw === "manager_reopened") return "manager_reopened";
  if (raw === "completed") return "completed";
  return raw;
}

/** Employee may create/edit/complete milestones only after manager acceptance (active work). */
export function canMutateMilestonesForStatus(status: string | undefined): boolean {
  const n = normalizeGoalStatus(status);
  return n === "in_progress" || n === "manager_reopened";
}

export function isPendingApprovalStatus(status: string | undefined): boolean {
  const s = normalizeGoalStatus(status);
  return s === "pending" || s === "pending_manager_approval";
}
