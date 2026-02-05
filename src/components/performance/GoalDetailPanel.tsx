import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerPortal,
  DrawerOverlay
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Goal, Milestone } from "@/hooks/use-goals";
import {
  Calendar,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Clock,
  Download,
  Edit,
  RefreshCw,
  Send,
  Target,
  Trash2,
  X
} from "lucide-react";


interface EmployeeSummary {
  id: string;
  name: string;
  role?: string;
  department?: string;
  avatarUrl?: string;
}

export interface GoalDetailSnapshot {
  id: string;
  title: string;
  status: string;
  completion: number;
  category: string;
  targetDate: string;
  description?: string;
  weightage?: number;
  managerApproved?: boolean;
  managerReopened?: boolean;
  milestones?: Milestone[];
}

export interface GoalDetailPanelProps {
  open: boolean;
  goalId: string | null;
  employee: EmployeeSummary | null;
  summary?: GoalDetailSnapshot | null;
  categoryGoals?: GoalDetailSnapshot[]; // For category view with multiple goals
  categoryName?: string; // Category name when showing multiple goals
  onClose: () => void;
  getGoal: (goalId: string) => Promise<Goal | null>;
  onEditGoal?: (goalId: string) => void;
  onAddMilestone?: (goalId: string) => void;
  onMilestoneClick?: (goalId: string, milestone: Milestone) => void;
  onSubmitGoal?: (goalId: string) => void;
  isSubmittingGoal?: boolean;
  triggerRef?: React.RefObject<HTMLElement> | null;
  onGoalOpened?: (goalId: string) => void;
  onGoalClosed?: (goalId: string) => void;
  onGoalUpdate?: () => Promise<void> | void;
  onDeleteGoal?: (goalId: string) => Promise<void> | void;
  panelId?: string;
}



const MAX_INITIAL_MILESTONES = 10;
const MILESTONE_INCREMENT = 10;

const statusBadge = (status: string) => {
  switch (status) {
    case "completed":
      return "bg-green-500/10 text-green-600 border-green-500/20";
    case "in_progress":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "pending_manager_approval":
      return "bg-blue-500/10 text-blue-600 border-blue-500/20";
    case "manager_reopened":
      return "bg-orange-500/10 text-orange-600 border-orange-500/20";
    default:
      return "bg-muted text-muted-foreground border-border/50";
  }
};

const statusLabel = (status: string) => {
  switch (status) {
    case "completed":
      return "Completed";
    case "in_progress":
      return "In Progress";
    case "pending_manager_approval":
      return "Pending Manager Approval";
    case "manager_reopened":
      return "Reopened";
    default:
      return "Pending";
  }
};

function getQuarterLabel(date: string | undefined) {
  if (!date) return "No Due Date";
  const dt = new Date(date);
  if (Number.isNaN(dt.getTime())) {
    return "No Due Date";
  }
  const quarter = Math.floor(dt.getMonth() / 3) + 1;
  return `Q${quarter} ${dt.getFullYear()}`;
}

function getMilestoneStatusBucket(milestone: Milestone) {
  if (milestone.completed) return "Completed";
  const due = milestone.dueDate ? new Date(milestone.dueDate) : null;
  const now = new Date();
  if (due && due < now) {
    return "Overdue";
  }
  return "Upcoming";
}

interface GroupedMilestones {
  bucket: string;
  quarters: Array<{ label: string; milestones: Milestone[] }>;
}

function groupMilestones(milestones: Milestone[]): GroupedMilestones[] {
  const groups = new Map<string, Map<string, Milestone[]>>();

  milestones.forEach((milestone) => {
    const bucket = getMilestoneStatusBucket(milestone);
    const quarter = getQuarterLabel(milestone.dueDate);
    if (!groups.has(bucket)) {
      groups.set(bucket, new Map());
    }
    const quarterMap = groups.get(bucket)!;
    if (!quarterMap.has(quarter)) {
      quarterMap.set(quarter, []);
    }
    quarterMap.get(quarter)!.push(milestone);
  });

  return Array.from(groups.entries()).map(([bucket, quarterMap]) => ({
    bucket,
    quarters: Array.from(quarterMap.entries()).map(([label, items]) => ({
      label,
      milestones: items.sort((a, b) => {
        const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDate - bDate;
      })
    }))
  }));
}

export function GoalDetailPanel({
  open,
  goalId,
  employee,
  summary,
  categoryGoals,
  categoryName,
  onClose,
  getGoal,
  onEditGoal,
  onAddMilestone,
  onMilestoneClick,
  onSubmitGoal,
  isSubmittingGoal = false,
  triggerRef,
  onGoalOpened,
  onGoalClosed,
  onGoalUpdate,
  onDeleteGoal,
  panelId
}: GoalDetailPanelProps) {


  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [details, setDetails] = useState<Goal | null>(null);
  const [visibleMilestones, setVisibleMilestones] = useState(MAX_INITIAL_MILESTONES);
  const [error, setError] = useState<string | null>(null);

  const [selectedGoalFromCategory, setSelectedGoalFromCategory] = useState<string | null>(null);

  const [expandedGoalIds, setExpandedGoalIds] = useState<Set<string>>(new Set());
  const [expandedGoalDetails, setExpandedGoalDetails] = useState<Map<string, Goal>>(new Map());
  const [loadingGoalIds, setLoadingGoalIds] = useState<Set<string>>(new Set());
  const cacheRef = useRef<Map<string, Goal>>(new Map());
  const previousGoalIdRef = useRef<string | null>(null);
  const hasAnnouncedRef = useRef(false);

  // Determine if we're in category view mode
  const isCategoryView = categoryGoals && categoryGoals.length > 0 && !selectedGoalFromCategory;

  // When a goal is selected from category, use details; otherwise use summary
  const activeSummary = selectedGoalFromCategory && details
    ? {
      id: details.id,
      title: details.title,
      completion: details.completion,
      status: details.status,
      targetDate: details.targetDate,
      category: details.category,
      description: details.description,
      weightage: details.weightage,
      managerApproved: details.managerApproved,
      managerReopened: details.managerReopened,
      milestones: details.milestones
    }
    : summary;

  const totalMilestones = details?.milestones?.length ?? activeSummary?.milestones?.length ?? 0;

  const goalTitle = details?.title ?? activeSummary?.title ?? "Goal";
  const goalStatus = details?.status ?? activeSummary?.status ?? "pending";
  const goalCompletion = details?.completion ?? activeSummary?.completion ?? 0;
  const goalCategory = details?.category ?? activeSummary?.category ?? "";
  const goalTargetDate = details?.targetDate ?? activeSummary?.targetDate ?? "";
  const goalDescription = details?.description ?? activeSummary?.description ?? "";
  const goalWeightage = details?.weightage ?? activeSummary?.weightage;
  const goalManagerApproved = details?.managerApproved ?? activeSummary?.managerApproved;
  const goalManagerReopened = details?.managerReopened ?? activeSummary?.managerReopened;


  // Use selectedGoalFromCategory as goalId if available, otherwise use prop goalId
  const activeGoalId = selectedGoalFromCategory || goalId;

  const groupedMilestones = useMemo(() => {
    const currentMilestones = details?.milestones ?? summary?.milestones ?? [];
    return groupMilestones(currentMilestones);
  }, [details?.milestones, summary?.milestones]);

  const flattenedMilestones = useMemo(() => {
    const currentMilestones = details?.milestones ?? summary?.milestones ?? [];
    return currentMilestones.slice().sort((a, b) => {
      const aDate = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
      const bDate = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
      return aDate - bDate;
    });
  }, [details?.milestones, summary?.milestones]);

  useEffect(() => {
    if (!open || !summary) return;
    setDetails((prev) => {
      if (!prev || prev.id !== summary.id) {
        return prev;
      }

      const snapshotMilestones = summary.milestones ?? [];
      const previousMilestones = prev.milestones ?? [];

      const hasDifference =
        snapshotMilestones.length !== previousMilestones.length ||
        snapshotMilestones.some((milestone, index) => {
          const prevMilestone = previousMilestones[index];
          if (!prevMilestone) return true;
          return (
            milestone.id !== prevMilestone.id ||
            milestone.title !== prevMilestone.title ||
            milestone.completed !== prevMilestone.completed ||
            milestone.dueDate !== prevMilestone.dueDate
          );
        });

      if (!hasDifference) {
        return prev;
      }

      return {
        ...prev,
        title: summary.title,
        status: summary.status as Goal["status"],
        completion: summary.completion ?? prev.completion,
        category: summary.category,
        targetDate: summary.targetDate ?? prev.targetDate,
        description: summary.description ?? prev.description,
        weightage: summary.weightage ?? prev.weightage,
        managerApproved: summary.managerApproved ?? prev.managerApproved,
        managerReopened: summary.managerReopened ?? prev.managerReopened,
        milestones: snapshotMilestones
      };
    });
  }, [open, summary]);

  useEffect(() => {
    if (!categoryGoals || categoryGoals.length === 0) return;
    setExpandedGoalDetails((prev) => {
      const newMap = new Map(prev);
      categoryGoals.forEach((snapshot) => {
        if (newMap.has(snapshot.id)) {
          const existing = newMap.get(snapshot.id);
          if (existing) {
            newMap.set(snapshot.id, {
              ...existing,
              title: snapshot.title,
              status: snapshot.status as Goal["status"],
              completion: snapshot.completion ?? existing.completion,
              category: snapshot.category,
              targetDate: snapshot.targetDate ?? existing.targetDate,
              description: snapshot.description ?? existing.description,
              weightage: snapshot.weightage ?? existing.weightage,
              managerApproved: snapshot.managerApproved ?? existing.managerApproved,
              managerReopened: snapshot.managerReopened ?? existing.managerReopened,
              milestones: snapshot.milestones ?? existing.milestones
            });
          }
        }
      });
      return newMap;
    });
  }, [categoryGoals]);

  const hasMoreMilestones = visibleMilestones < flattenedMilestones.length;

  const resetState = useCallback(() => {
    setVisibleMilestones(MAX_INITIAL_MILESTONES);
    setError(null);
    hasAnnouncedRef.current = false;
  }, []);

  const handleDeleteGoal = async (id: string, title: string) => {
    if (!onDeleteGoal) return;

    const confirmed = window.confirm(`Are you sure you want to delete the goal: "${title}"? This action cannot be undone.`);
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await onDeleteGoal(id);
      onClose();
    } catch (err) {
      console.error("Error deleting goal:", err);
    } finally {
      setIsDeleting(false);
    }
  };


  const announceOpen = useCallback(() => {
    if (hasAnnouncedRef.current || !open) return;
    const message = `Goal details for ${goalTitle}. Press Escape to close.`;
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("goal-panel:announce", { detail: message }));
    }
    hasAnnouncedRef.current = true;
  }, [goalTitle, open]);

  useEffect(() => {
    // Reset category view state when panel closes
    if (!open) {
      setSelectedGoalFromCategory(null);
      setExpandedGoalIds(new Set());
      setExpandedGoalDetails(new Map());
      setLoadingGoalIds(new Set());
      return;
    }

    // If in category view, don't load a specific goal
    if (isCategoryView && !selectedGoalFromCategory) {
      setDetails(null);
      setLoading(false);
      return;
    }

    // Load goal details if goalId is provided or if a goal is selected from category
    const goalToLoad = selectedGoalFromCategory || goalId;
    if (open && goalToLoad) {
      const cached = cacheRef.current.get(goalToLoad);
      if (cached) {
        setDetails(cached);
        setLoading(false);
      } else {
        setLoading(true);
      }
      setError(null);
      hasAnnouncedRef.current = false;

      const isActive = true;
      (async () => {
        try {
          const result = await getGoal(goalToLoad);
          if (!isActive) return;
          if (result) {
            cacheRef.current.set(goalToLoad, result);
            setDetails(result);
          }
        } catch (err) {
          console.error("Failed to load goal details", err);
          if (isActive) {
            setError("Unable to load goal details right now.");
          }
        } finally {
          if (isActive) {
            setLoading(false);
            announceOpen();
          }
        }
      })();

      onGoalOpened?.(goalToLoad);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("performance:goal_panel_open", { detail: { goalId: goalToLoad } }));
      }

      previousGoalIdRef.current = goalToLoad;
    }
  }, [announceOpen, getGoal, goalId, selectedGoalFromCategory, onGoalOpened, open, isCategoryView]);

  useEffect(() => {
    if (!open && previousGoalIdRef.current) {
      const last = previousGoalIdRef.current;
      onGoalClosed?.(last);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("performance:goal_panel_close", { detail: { goalId: last } }));
      }
      previousGoalIdRef.current = null;
      if (triggerRef?.current) {
        triggerRef.current.focus();
      }
    }
  }, [open, onGoalClosed, triggerRef]);

  useEffect(() => {
    if (open) {
      resetState();
    }
  }, [open, resetState]);

  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (!hasMoreMilestones) return;
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollTop + clientHeight >= scrollHeight - 160) {
      setVisibleMilestones((prev) => Math.min(prev + MILESTONE_INCREMENT, flattenedMilestones.length));
    }
  }, [flattenedMilestones.length, hasMoreMilestones]);

  const handleGoalSelect = useCallback(async (goalId: string) => {
    setSelectedGoalFromCategory(goalId);
    setExpandedGoalIds(new Set());
    setLoading(true);
    setError(null);

    try {
      const cached = cacheRef.current.get(goalId);
      if (cached) {
        setDetails(cached);
        setLoading(false);
        return;
      }

      const result = await getGoal(goalId);
      if (result) {
        cacheRef.current.set(goalId, result);
        setDetails(result);
      }
    } catch (err) {
      console.error("Failed to load goal details", err);
      setError("Unable to load goal details right now.");
    } finally {
      setLoading(false);
    }
  }, [getGoal]);

  const handleGoalExpand = useCallback((goalId: string) => {
    setExpandedGoalIds((prev) => {
      const newSet = new Set(prev);
      const wasExpanded = newSet.has(goalId);
      if (wasExpanded) {
        newSet.delete(goalId);
        // Optionally clear details when collapsing
        setExpandedGoalDetails((prevDetails) => {
          const newDetails = new Map(prevDetails);
          newDetails.delete(goalId);
          return newDetails;
        });
      } else {
        newSet.add(goalId);
        // Auto-load goal details when expanding (if not already loaded)
        const cached = cacheRef.current.get(goalId);
        if (cached) {
          setExpandedGoalDetails((prev) => {
            const newMap = new Map(prev);
            newMap.set(goalId, cached);
            return newMap;
          });
        } else if (!loadingGoalIds.has(goalId)) {
          // Load goal details
          setLoadingGoalIds((prev) => new Set(prev).add(goalId));
          getGoal(goalId)
            .then((result) => {
              if (result) {
                cacheRef.current.set(goalId, result);
                setExpandedGoalDetails((prev) => {
                  const newMap = new Map(prev);
                  newMap.set(goalId, result);
                  return newMap;
                });
              }
            })
            .catch((err) => {
              console.error("Failed to load goal details", err);
            })
            .finally(() => {
              setLoadingGoalIds((prev) => {
                const newSet = new Set(prev);
                newSet.delete(goalId);
                return newSet;
              });
            });
        }
      }
      return newSet;
    });
  }, [getGoal, loadingGoalIds]);

  const handleBackToCategory = useCallback(() => {
    setSelectedGoalFromCategory(null);
    setDetails(null);
    setExpandedGoalIds(new Set());
    setExpandedGoalDetails(new Map());
    setLoadingGoalIds(new Set());
  }, []);

  const renderMilestone = useCallback((milestone: Milestone, index: number) => (
    <div key={milestone.id} className="space-y-2">
      <button
        type="button"
        onClick={() => {
          if (onMilestoneClick) {
            onMilestoneClick(goalId!, milestone);
          }
        }}
        disabled={!onMilestoneClick}
        className={cn(
          "group w-full flex items-center gap-3 text-xs p-3 rounded-lg border text-left transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1",
          milestone.completed
            ? "bg-gradient-to-r from-green-500/10 to-green-500/5 border-green-500/30 hover:border-green-500/50 hover:shadow-sm"
            : "bg-gradient-to-r from-muted/40 to-muted/30 border-border/60 hover:from-primary/10 hover:to-primary/5 hover:border-primary/40 hover:shadow-sm",
          onMilestoneClick ? "cursor-pointer active:scale-[0.98]" : "cursor-default"
        )}
      >
        <div
          className={cn(
            "flex-shrink-0 rounded-full p-1.5",
            milestone.completed ? "bg-green-500/20" : "bg-muted"
          )}
        >
          {milestone.completed ? (
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <span
          className={cn(
            "flex-1 break-words font-medium",
            milestone.completed ? "line-through text-muted-foreground" : "text-foreground"
          )}
        >
          {milestone.title || `Milestone ${index + 1}`}
        </span>
        {milestone.dueDate && (
          <span
            className={cn(
              "text-[10px] whitespace-nowrap flex-shrink-0 px-2 py-1 rounded-md font-medium",
              milestone.completed ? "text-green-600/70 bg-green-500/10" : "text-muted-foreground bg-muted/50"
            )}
          >
            {new Date(milestone.dueDate).toLocaleDateString()}
          </span>
        )}
        {onMilestoneClick && (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
        )}
      </button>

      {(milestone.userComment || milestone.managerComment || milestone.evidence) && (
        <div className="space-y-1.5 pl-2">
          {milestone.userComment && (
            <div className="rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
              <p className="font-semibold text-foreground/80 mb-1">Your Comment</p>
              <p className="break-words leading-relaxed">{milestone.userComment}</p>
            </div>
          )}
          {milestone.managerComment && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] text-primary/80">
              <p className="font-semibold text-primary mb-1">Manager Comment</p>
              <p className="break-words leading-relaxed">{milestone.managerComment}</p>
            </div>
          )}
          {milestone.evidence && (
            <div className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-background/80 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Download className="h-3 w-3" />
              <span className="truncate max-w-[200px]">{milestone.evidence}</span>
            </div>
          )}
        </div>
      )}
    </div>
  ), [goalId, onMilestoneClick]);

  const renderMilestoneGroups = () => {
    let renderedCount = 0;
    const limit = visibleMilestones;

    return groupedMilestones.map((group) => (
      <div key={group.bucket} className="space-y-3">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-2.5 py-1 text-xs font-semibold">
            {group.bucket}
          </Badge>
          <Separator className="flex-1" />
        </div>
        {group.quarters.map((section) => {
          const remaining = limit - renderedCount;
          if (remaining <= 0) return null;
          const sectionMilestones = section.milestones.slice(0, remaining);
          renderedCount += sectionMilestones.length;

          return (
            <div key={`${group.bucket}-${section.label}`} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {section.label}
              </p>
              <div className="space-y-2">
                {sectionMilestones.map((milestone, idx) => renderMilestone(milestone, idx))}
              </div>
            </div>
          );
        })}
      </div>
    ));
  };

  // Category List View
  const CategoryListView = categoryGoals && categoryGoals.length > 0 && (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-border/50 bg-gradient-to-r from-primary/10 via-background/80 to-background/95 px-6 py-5 flex-shrink-0 backdrop-blur">
        <div className="flex items-start gap-4 min-w-0">
          <Avatar className="h-12 w-12 border-2 border-primary/30 ring-4 ring-primary/10 shadow-lg flex-shrink-0">
            {employee?.avatarUrl ? (
              <AvatarImage src={employee.avatarUrl} alt={employee.name} />
            ) : (
              <AvatarFallback className="text-sm font-semibold bg-primary/10 text-primary">
                {employee?.name?.split(" ").map((n) => n[0]).join("").slice(0, 2) || "?"}
              </AvatarFallback>
            )}
          </Avatar>
          <div className="flex-1 min-w-0 space-y-3 overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
                  <Target className="h-4 w-4" />
                </div>
                <h2
                  id="goal-panel-title"
                  className="text-xl font-semibold leading-tight text-foreground tracking-tight flex-1 min-w-0 break-words"
                  style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
                >
                  {categoryName || "Goals"}
                </h2>
              </div>
              <div className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-3 py-0.5 text-[11px] font-semibold text-primary shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-primary"></span>
                <span>{categoryGoals.length} {categoryGoals.length === 1 ? "Goal" : "Goals"}</span>
              </div>
            </div>
            {employee && (
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {employee.name}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground/90">
                  {employee.role && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground truncate max-w-[160px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/50"></span>
                      <span className="truncate">{employee.role}</span>
                    </span>
                  )}
                  {employee.department && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-muted/40 px-2 py-0.5 font-medium text-muted-foreground truncate max-w-[160px]">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/50"></span>
                      <span className="truncate">{employee.department}</span>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 px-6 py-4">
          {categoryGoals.map((goal) => {
            const isExpanded = expandedGoalIds.has(goal.id);
            const goalDetails = expandedGoalDetails.get(goal.id) || null;
            const isLoadingGoal = loadingGoalIds.has(goal.id);

            return (
              <div
                key={goal.id}
                className="rounded-lg border border-border/60 bg-background/60 shadow-sm overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => handleGoalExpand(goal.id)}
                  className="w-full p-4 text-left hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <h3 className="text-sm font-semibold break-words">{goal.title}</h3>
                        <Badge className={cn("border text-[11px] flex-shrink-0", statusBadge(goal.status))}>
                          {statusLabel(goal.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                          {Math.round(goal.completion)}%
                        </span>
                        {goal.targetDate && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="h-3 w-3 flex-shrink-0" />
                            Due {new Date(goal.targetDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 text-muted-foreground transition-transform flex-shrink-0",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border/60 bg-gradient-to-br from-background/50 via-background/30 to-background/50 p-5 space-y-5 max-h-[60vh] overflow-y-auto">
                    {isLoadingGoal ? (
                      <div className="space-y-3">
                        <Skeleton className="h-4 w-3/4" />
                        <Skeleton className="h-20 w-full rounded-lg" />
                      </div>
                    ) : (
                      <>
                        {/* Status and Progress Cards */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg bg-gradient-to-br from-blue-500/10 to-blue-500/5 border border-blue-500/20 p-3 backdrop-blur-sm">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></div>
                              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-blue-600/80">
                                Status
                              </h4>
                            </div>
                            <Badge className={cn("border text-[11px] font-medium shadow-sm", statusBadge(goal.status))}>
                              {statusLabel(goal.status)}
                            </Badge>
                          </div>
                          <div className="rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-3 backdrop-blur-sm">
                            <div className="flex items-center gap-2 mb-2">
                              <div className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse"></div>
                              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">
                                Progress
                              </h4>
                            </div>
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-xl font-bold text-primary">{Math.round(goal.completion)}</span>
                              <span className="text-xs font-medium text-primary/70">%</span>
                            </div>
                            <div className="mt-2 h-1.5 bg-primary/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full transition-all duration-500"
                                style={{ width: `${goal.completion}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons for Manager */}
                        {(onEditGoal || onAddMilestone || onDeleteGoal) && goal.id && (
                          <div className="flex flex-col gap-2.5">
                            <div className="flex gap-2.5">
                              {onEditGoal && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onEditGoal(goal.id)}
                                  className="flex-1 bg-gradient-to-r from-background to-background/80 hover:from-primary/10 hover:to-primary/5 border-primary/20 hover:border-primary/40 transition-all duration-200 shadow-sm hover:shadow-md"
                                >
                                  <Edit className="h-3.5 w-3.5 mr-1.5" />
                                  Edit Goal
                                </Button>
                              )}
                              {onAddMilestone && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => onAddMilestone(goal.id)}
                                  className="flex-1 bg-gradient-to-r from-background to-background/80 hover:from-primary/10 hover:to-primary/5 border-primary/20 hover:border-primary/40 transition-all duration-200 shadow-sm hover:shadow-md"
                                >
                                  <Target className="h-3.5 w-3.5 mr-1.5" />
                                  Add Milestone
                                </Button>
                              )}
                            </div>
                            {onDeleteGoal && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeleteGoal(goal.id, goal.title)}
                                disabled={isDeleting}
                                className="w-full bg-destructive/5 hover:bg-destructive/10 text-destructive border-destructive/20 hover:border-destructive/40 transition-all duration-200"
                              >
                                {isDeleting ? (
                                  <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                                )}
                                Delete Goal
                              </Button>
                            )}
                          </div>
                        )}


                        {/* Goal Details Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {goal.targetDate && (
                            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 hover:bg-muted/40 transition-colors">
                              <div className="flex items-center gap-2 mb-2">
                                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Target Date
                                </h4>
                              </div>
                              <span className="text-sm font-medium text-foreground">
                                {new Date(goal.targetDate).toLocaleDateString()}
                              </span>
                            </div>
                          )}

                          {goal.category && (
                            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 hover:bg-muted/40 transition-colors">
                              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Category
                              </h4>
                              <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-background/50 border-primary/20 hover:border-primary/40 max-w-full">
                                <span className="truncate block">{goal.category}</span>
                              </div>
                            </div>
                          )}

                          {goalDetails?.weightage && (
                            <div className="rounded-lg bg-muted/30 border border-border/50 p-3 hover:bg-muted/40 transition-colors">
                              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                                Weightage
                              </h4>
                              <div className="flex items-baseline gap-1">
                                <span className="text-lg font-bold text-foreground">{goalDetails.weightage}</span>
                                <span className="text-xs font-medium text-muted-foreground">%</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {(goalDetails?.description || goal.description) && (
                          <div className="rounded-lg bg-muted/20 border border-border/50 p-4">
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                              <div className="h-0.5 w-4 bg-primary/40"></div>
                              Description
                            </h4>
                            <p className="text-sm text-foreground/90 leading-relaxed break-words">
                              {goalDetails?.description || goal.description}
                            </p>
                          </div>
                        )}

                        {(goalDetails?.milestones || goal.milestones) ? (
                          <>
                            {((goalDetails?.milestones || goal.milestones)?.length || 0) > 0 ? (
                              <div>
                                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
                                  <div className="h-0.5 w-4 bg-primary/40"></div>
                                  Milestones ({(goalDetails?.milestones || goal.milestones)?.length || 0})
                                </h4>
                                <div className="space-y-2.5">
                                  {(goalDetails?.milestones || goal.milestones)?.map((milestone) => (
                                    <button
                                      key={milestone.id}
                                      type="button"
                                      onClick={() => {
                                        if (onMilestoneClick && goal.id) {
                                          onMilestoneClick(goal.id, milestone);
                                        }
                                      }}
                                      disabled={!onMilestoneClick}
                                      className={cn(
                                        "w-full flex items-center gap-3 text-xs p-3 rounded-lg border text-left transition-all duration-200",
                                        "focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-1",
                                        milestone.completed
                                          ? "bg-gradient-to-r from-green-500/10 to-green-500/5 border-green-500/30 hover:border-green-500/50 hover:shadow-sm"
                                          : "bg-gradient-to-r from-muted/40 to-muted/30 border-border/60 hover:from-primary/10 hover:to-primary/5 hover:border-primary/40 hover:shadow-sm",
                                        onMilestoneClick && "cursor-pointer active:scale-[0.98]",
                                        !onMilestoneClick && "cursor-default"
                                      )}
                                    >
                                      <div className={cn(
                                        "flex-shrink-0 rounded-full p-1.5",
                                        milestone.completed
                                          ? "bg-green-500/20"
                                          : "bg-muted"
                                      )}>
                                        {milestone.completed ? (
                                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                                        ) : (
                                          <Clock className="h-4 w-4 text-muted-foreground" />
                                        )}
                                      </div>
                                      <span className={cn(
                                        "flex-1 break-words font-medium",
                                        milestone.completed
                                          ? "line-through text-muted-foreground"
                                          : "text-foreground"
                                      )}>
                                        {milestone.title}
                                      </span>
                                      {milestone.dueDate && (
                                        <span className={cn(
                                          "text-[10px] whitespace-nowrap flex-shrink-0 px-2 py-1 rounded-md font-medium",
                                          milestone.completed
                                            ? "text-green-600/70 bg-green-500/10"
                                            : "text-muted-foreground bg-muted/50"
                                        )}>
                                          {new Date(milestone.dueDate).toLocaleDateString()}
                                        </span>
                                      )}
                                      {onMilestoneClick && (
                                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" />
                                      )}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-lg border border-dashed border-border/50 bg-muted/20 p-6">
                                <div className="text-center">
                                  <Target className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                                  <p className="text-xs font-medium text-muted-foreground">No milestones added yet</p>
                                </div>
                              </div>
                            )}
                          </>
                        ) : isLoadingGoal ? (
                          <div>
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                              Milestones
                            </h4>
                            <div className="space-y-2.5">
                              <Skeleton className="h-12 w-full rounded-lg" />
                              <Skeleton className="h-12 w-full rounded-lg" />
                            </div>
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  // Single Goal Detail View
  const PanelContent = !isCategoryView && (
    <div className="flex h-full flex-col">
      <header className="border-b border-border/50 px-6 py-4 bg-background/50">
        <div className="space-y-3">
          {selectedGoalFromCategory && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleBackToCategory}
              className="flex-shrink-0 -ml-2 -mt-1"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h2
                  id="goal-panel-title"
                  className="text-lg font-semibold leading-tight break-words"
                  style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
                >
                  {goalTitle}
                </h2>
                <Badge className={cn("border text-xs flex-shrink-0", statusBadge(goalStatus))}>
                  {statusLabel(goalStatus)}
                </Badge>
              </div>
              {employee && (
                <div className="space-y-1.5">
                  <div className="flex flex-col gap-1">
                    <span className="font-medium text-foreground text-sm">{employee.name}</span>
                    {employee.role && (
                      <span className="text-sm text-muted-foreground">{employee.role}</span>
                    )}
                    {employee.department && (
                      <span className="text-xs text-muted-foreground">{employee.department}</span>
                    )}
                  </div>
                  {goalCategory && (
                    <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/50 px-2 py-0.5 text-xs text-muted-foreground">
                      <Target className="h-3 w-3 flex-shrink-0" />
                      <span>{goalCategory}</span>
                    </div>
                  )}
                  {goalTargetDate && (
                    <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary border border-primary/20">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Due: {new Date(goalTargetDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex-shrink-0">
              <span className="text-3xl font-bold text-primary leading-none">{Math.round(goalCompletion)}%</span>
            </div>
          </div>
        </div>
      </header>

      <div
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
      >
        <div className="space-y-6 px-6 py-5">
          {loading ? (
            <div className="space-y-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-48 w-full" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <Fragment>
              {goalDescription && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground bg-primary/10 px-3 py-2 rounded-md border border-primary/20">
                    Goal Overview
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground pl-1">{goalDescription}</p>
                </section>
              )}

              {goalManagerReopened && (
                <section className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-4">
                  <div className="flex items-start gap-2 text-orange-600">
                    <RefreshCw className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm font-semibold">Goal Reopened by Manager</p>
                  </div>
                  <p className="mt-2 text-xs text-orange-600/90">
                    Your manager has reopened this goal. Review the feedback and update milestones accordingly.
                  </p>
                </section>
              )}

              {goalManagerApproved && goalStatus === "completed" && (
                <section className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
                  <div className="flex items-start gap-2 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                    <p className="text-sm font-semibold">Approved by Manager</p>
                  </div>
                  <p className="mt-2 text-xs text-emerald-600/90">
                    Congratulations! This goal has been reviewed and approved by your manager.
                  </p>
                </section>
              )}

              <section className="space-y-3" aria-labelledby="milestone-heading">
                <div className="flex items-center justify-between bg-primary/10 px-3 py-2 rounded-md border border-primary/20">
                  <h3 id="milestone-heading" className="text-sm font-semibold uppercase tracking-wide text-foreground">
                    Milestones
                  </h3>
                  <div className="text-xs font-medium text-muted-foreground">{flattenedMilestones.length} total</div>
                </div>

                {flattenedMilestones.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border/60 p-6 text-center text-sm text-muted-foreground">
                    No milestones have been added for this goal yet.
                  </div>
                ) : (
                  <div className="space-y-6" aria-live="polite">
                    {renderMilestoneGroups()}
                    {hasMoreMilestones && (
                      <div className="flex justify-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setVisibleMilestones((prev) => Math.min(prev + MILESTONE_INCREMENT, flattenedMilestones.length))}
                        >
                          Load more
                          <ChevronRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </section>
            </Fragment>
          )}
        </div>
      </div>

      <footer className="border-t border-border/50 bg-background/60 px-6 py-4">
        <div className="flex flex-wrap gap-2">
          {onEditGoal && activeGoalId && (
            <Button variant="outline" size="sm" onClick={() => onEditGoal(activeGoalId)}>
              Edit Goal
            </Button>
          )}
          {onAddMilestone && activeGoalId && (
            <Button variant="outline" size="sm" onClick={() => onAddMilestone(activeGoalId)}>
              Add Milestone
            </Button>
          )}
          {onDeleteGoal && activeGoalId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleDeleteGoal(activeGoalId, goalTitle)}
              disabled={isDeleting}
              className="text-destructive border-destructive/20 hover:bg-destructive/10 hover:border-destructive/40"
            >
              {isDeleting ? (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Delete Goal
            </Button>
          )}

          {onSubmitGoal && activeGoalId && (
            <Button
              size="sm"
              className={cn(
                "bg-primary text-primary-foreground hover:bg-primary/90",
                goalCompletion < 100 && "opacity-50 cursor-not-allowed bg-muted text-muted-foreground hover:bg-muted"
              )}
              onClick={() => onSubmitGoal(activeGoalId)}
              disabled={isSubmittingGoal || goalCompletion < 100}
            >
              {isSubmittingGoal ? (
                <span className="flex items-center gap-2">
                  <Clock className="h-4 w-4 animate-spin" />
                  Submitting...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="h-4 w-4" />
                  Submit for Review
                </span>
              )}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );

  const dialogProps = {
    open,
    onOpenChange: (value: boolean) => {
      if (!value) {
        onClose();
      }
    }
  };

  const resolvedPanelId = panelId ?? "goal-detail-panel";

  const contentToRender = isCategoryView ? CategoryListView : PanelContent;

  if (isDesktop) {
    return (
      <Sheet {...dialogProps}>
        <SheetContent
          side="right"
          role="dialog"
          aria-modal="true"
          aria-labelledby="goal-panel-title"
          aria-describedby={isCategoryView ? undefined : "milestone-heading"}
          id={resolvedPanelId}
          className="w-full max-w-[520px] sm:w-[420px] md:w-[480px] lg:w-[520px] border-l border-border/40 bg-background/95 p-0 shadow-2xl backdrop-blur transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] data-[state=closed]:duration-200"
        >
          {contentToRender}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Drawer {...dialogProps}>
      <DrawerPortal>
        <DrawerOverlay className="backdrop-blur-sm transition-opacity duration-200 ease-in" />
        <DrawerContent
          id={resolvedPanelId}
          className="h-[85vh] max-h-[90vh] rounded-t-3xl border-border/40 bg-background/98 p-0 shadow-2xl transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] data-[state=closed]:duration-200"
        >
          {contentToRender}
        </DrawerContent>
      </DrawerPortal>
    </Drawer>
  );
}
