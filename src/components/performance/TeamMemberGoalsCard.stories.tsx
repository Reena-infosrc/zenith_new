import type { Meta, StoryObj } from "@storybook/react";
import { TeamMemberGoalsCard } from "./TeamMemberGoalsCard";
import { Milestone } from "./GoalCard";

const meta: Meta<typeof TeamMemberGoalsCard> = {
  title: "Performance/TeamMemberGoalsCard",
  component: TeamMemberGoalsCard,
  parameters: {
    layout: "centered"
  },
  argTypes: {
    onFetchGoals: { action: "fetchGoals" },
    onSetGoals: { action: "setGoals" },
    onAddGoal: { action: "addGoal" },
    onEditGoal: { action: "editGoal" },
    onDeleteGoal: { action: "deleteGoal", control: false },
    onMilestoneClick: { action: "milestoneClick" },
    onAddMilestone: { action: "addMilestone" }
  }
};

export default meta;
type Story = StoryObj<typeof TeamMemberGoalsCard>;

const sampleMilestones: Milestone[] = [
  {
    id: "m1",
    title: "Kick-off workshop",
    completed: true,
    dueDate: "2024-05-01",
    completedDate: "2024-04-28",
    userComment: "Session completed with team"
  },
  {
    id: "m2",
    title: "Implement automation suite",
    completed: false,
    dueDate: "2024-06-15"
  },
  {
    id: "m3",
    title: "Regression coverage 90%",
    completed: false,
    dueDate: "2024-07-30"
  }
];

export const Default: Story = {
  args: {
    employee: {
      id: "emp-1",
      name: "Vignesh Ram B",
      position: "Automation QA Architect",
      department: "Delivery",
      yearsOfExperience: 11,
      skills: ["Automation", "Playwright", "Cypress", "Leadership"]
    },
    summary: {
      total: 2,
      active: 1,
      completed: 1
    },
    goals: [
      {
        id: "goal-1",
        title: "Modernise automation framework",
        description: "Introduce parallel execution and visual testing",
        category: "automation",
        targetDate: "2024-11-30",
        status: "in_progress",
        completion: 55,
        milestones: sampleMilestones
      },
      {
        id: "goal-2",
        title: "Mentor junior QA engineers",
        description: "Develop onboarding curriculum and monthly labs",
        category: "leadership",
        targetDate: "2024-09-15",
        status: "pending_manager_approval",
        completion: 100,
        milestones: sampleMilestones.slice(0, 2)
      }
    ],
    isLoading: false,
    onFetchGoals: async () => {},
    onSetGoals: () => {},
    onAddGoal: () => {},
    onEditGoal: () => {},
    onDeleteGoal: async () => {},
    onMilestoneClick: () => {},
    onAddMilestone: () => {}
  }
};

export const Loading: Story = {
  args: {
    ...Default.args,
    goals: [],
    isLoading: true
  }
};
