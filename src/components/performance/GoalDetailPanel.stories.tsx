import type { Meta, StoryObj } from "@storybook/react";
import { useMemo, useRef, useState } from "react";
import { GoalDetailPanel, GoalDetailSnapshot } from "./GoalDetailPanel";
import type { Goal } from "@/hooks/use-goals";
import { Button } from "@/components/ui/button";

const baseMilestones = [
  {
    id: "m1",
    title: "Kick-off workshop",
    completed: true,
    dueDate: "2024-05-01",
    completedDate: "2024-04-28",
    userComment: "Great session with the team"
  },
  {
    id: "m2",
    title: "Implement automation suite",
    completed: false,
    dueDate: "2024-06-15",
    managerComment: "Please include coverage report"
  },
  {
    id: "m3",
    title: "Regression coverage 90%",
    completed: false,
    dueDate: "2024-07-30"
  }
];

const summarySnapshot: GoalDetailSnapshot = {
  id: "goal-1",
  title: "Modernise automation framework",
  status: "in_progress",
  completion: 58,
  category: "Innovation/Initiatives/Collaboration",
  targetDate: "2024-11-30",
  description: "Introduce parallel execution and improve tooling across teams.",
  milestones: baseMilestones
};

const employeeSummary = {
  id: "emp-1",
  name: "Vignesh Ram B",
  role: "Automation QA Architect",
  department: "Delivery",
  avatarUrl: undefined
};

const templateGoal: Goal = {
  id: "goal-1",
  employeeId: "emp-1",
  title: summarySnapshot.title,
  description: summarySnapshot.description,
  category: summarySnapshot.category,
  targetDate: summarySnapshot.targetDate,
  status: "in_progress",
  completion: summarySnapshot.completion,
  milestones: baseMilestones,
  createdBy: "manager-1",
  managerApproved: false,
  managerReopened: false
};

const GoalPanelHost = ({
  goal = templateGoal,
  summary = summarySnapshot,
  employee = employeeSummary,
  delay = 350
}: {
  goal?: Goal;
  summary?: GoalDetailSnapshot;
  employee?: typeof employeeSummary;
  delay?: number;
}) => {
  const [open, setOpen] = useState(true);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const getGoal = useMemo(
    () =>
      async (goalId: string) => {
        if (delay > 0) {
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
        if (goalId === goal.id) {
          return goal;
        }
        return null;
      },
    [delay, goal]
  );

  return (
    <div className="min-h-[720px] bg-muted/20 p-6">
      <Button ref={triggerRef} onClick={() => setOpen(true)} variant="outline" className="mb-4">
        Open goal panel
      </Button>
      <GoalDetailPanel
        open={open}
        goalId={goal.id}
        summary={summary}
        employee={employee}
        onClose={() => setOpen(false)}
        getGoal={getGoal}
        onAddMilestone={() => undefined}
        onEditGoal={() => undefined}
        onMilestoneClick={() => undefined}
        triggerRef={triggerRef}
        panelId="storybook-goal-panel"
      />
    </div>
  );
};

const meta: Meta<typeof GoalPanelHost> = {
  title: "Performance/GoalDetailPanel",
  component: GoalPanelHost,
  parameters: {
    layout: "fullscreen"
  }
};

export default meta;

type Story = StoryObj<typeof GoalPanelHost>;

export const DesktopSlideOver: Story = {
  args: {}
};

export const LoadingState: Story = {
  args: {
    delay: 1500
  }
};

export const LargeMilestoneList: Story = {
  args: {
    goal: {
      ...templateGoal,
      id: "goal-many",
      milestones: Array.from({ length: 28 }).map((_, index) => ({
        id: `m-${index + 1}`,
        title: `Milestone ${index + 1}`,
        completed: index % 3 === 0,
        dueDate: `2024-${(index % 12) + 1}-15`
      }))
    },
    summary: {
      ...summarySnapshot,
      id: "goal-many",
      milestones: Array.from({ length: 12 }).map((_, index) => ({
        id: `s-${index + 1}`,
        title: `Snapshot milestone ${index + 1}`,
        completed: index % 2 === 0,
        dueDate: `2024-${(index % 12) + 1}-01`
      }))
    }
  }
};

export const MobileBottomSheet: Story = {
  args: {},
  parameters: {
    viewport: {
      defaultViewport: "mobile2"
    }
  }
};
