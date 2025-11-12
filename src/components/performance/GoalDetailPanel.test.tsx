import React, { useRef, useState } from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { GoalDetailPanel, GoalDetailSnapshot } from "./GoalDetailPanel";
import type { Goal } from "@/hooks/use-goals";

const summary: GoalDetailSnapshot = {
  id: "goal-1",
  title: "Improve Automation Coverage",
  status: "in_progress",
  completion: 42,
  category: "Innovation/Initiatives/Collaboration",
  targetDate: "2024-12-31",
  description: "Drive automated testing across critical journeys.",
  milestones: [
    { id: "m1", title: "Audit regression suite", completed: true, dueDate: "2024-05-01" },
    { id: "m2", title: "Add visual checks", completed: false, dueDate: "2024-08-15" }
  ]
};

const goalRecord: Goal = {
  id: "goal-1",
  employeeId: "emp-1",
  title: summary.title,
  description: summary.description,
  category: summary.category,
  targetDate: summary.targetDate,
  status: "in_progress",
  completion: summary.completion,
  milestones: summary.milestones,
  createdBy: "manager-1",
  managerApproved: false,
  managerReopened: false
};

const employee = {
  id: "emp-1",
  name: "Priya Sen",
  role: "QA Lead",
  department: "Delivery"
};

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: jest.fn().mockImplementation((query: string) => ({
      matches: query.includes("min-width: 768px"),
      media: query,
      onchange: null,
      addListener: jest.fn(),
      removeListener: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    }))
  });
});

describe("GoalDetailPanel", () => {
  it("renders summary information and loads goal details", async () => {
    const getGoal = jest.fn().mockResolvedValue(goalRecord);
    const triggerRef = React.createRef<HTMLButtonElement>();

    render(
      <>
        <button ref={triggerRef}>Open goal</button>
        <GoalDetailPanel
          open
          goalId={summary.id}
          summary={summary}
          employee={employee}
          onClose={jest.fn()}
          getGoal={getGoal}
          triggerRef={triggerRef}
          panelId="test-goal-panel"
        />
      </>
    );

    await waitFor(() => expect(getGoal).toHaveBeenCalledWith("goal-1"));
    expect(screen.getByRole("dialog", { name: /Improve Automation Coverage/i })).toBeInTheDocument();
    expect(screen.getByText(/Improve Automation Coverage/)).toBeInTheDocument();
    expect(screen.getByText(/Innovation\/Initiatives\/Collaboration/)).toBeInTheDocument();
  });

  it("closes and restores focus to the trigger button", async () => {
    const Wrapper = () => {
      const [open, setOpen] = useState(true);
      const triggerRef = useRef<HTMLButtonElement | null>(null);
      const getGoalRef = useRef(jest.fn().mockResolvedValue(goalRecord));

      return (
        <>
          <button ref={triggerRef} onClick={() => setOpen(true)}>
            Open goal
          </button>
          <GoalDetailPanel
            open={open}
            goalId={summary.id}
            summary={summary}
            employee={employee}
            onClose={() => setOpen(false)}
            getGoal={getGoalRef.current}
            triggerRef={triggerRef}
            panelId="test-goal-panel"
          />
        </>
      );
    };

    render(<Wrapper />);

    const closeButton = await screen.findByRole("button", { name: /close/i });
    fireEvent.click(closeButton);

    await waitFor(() => expect(screen.getByRole("button", { name: /open goal/i })).toHaveFocus());
  });
});
