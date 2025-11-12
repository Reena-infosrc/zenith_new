# GoalDetailPanel

`GoalDetailPanel` provides a responsive slide-over (desktop) and bottom-sheet (mobile) experience for reviewing performance goals without disturbing the underlying grid layout.

## Usage

```
import { GoalDetailPanel } from "@/components/performance/GoalDetailPanel";

const [open, setOpen] = useState(false);
const triggerRef = useRef<HTMLButtonElement | null>(null);

<GoalDetailPanel
  open={open}
  goalId={selectedGoalId}
  summary={summarySnapshot}
  employee={employeeSummary}
  getGoal={fetchGoalById}
  onClose={() => setOpen(false)}
  onAddMilestone={handleAddMilestone}
  onMilestoneClick={handleEditMilestone}
  onEditGoal={handleEditGoal}
  triggerRef={triggerRef}
/>
```

### Key props

- `summary`: lightweight snapshot used for instant render before the async `getGoal` call resolves.
- `panelId`: optional id connected to trigger buttons via `aria-controls`.
- `triggerRef`: restores focus to the invoking element when the panel closes.
- `onSubmitGoal`: enables the optional “Submit for Manager Review” CTA when milestones are complete.

## Accessibility & Interactions

- Uses Radix `Dialog`/Vaul `Drawer` primitives for focus trapping and inert background.
- Announces opening via `goal-panel:announce` custom event (`role="status"` region can subscribe if needed).
- Supports Escape key, backdrop click, mobile swipe to dismiss, and returns focus to the trigger.
- Backdrop fades in 200 ms; panel slides with a 300 ms cubic-bezier(.2,.8,.2,1) easing. Honors `prefers-reduced-motion`.

## Performance

- Lazy-loads goal details with in-memory caching (`Map<string, Goal>`).
- Renders the first 10 milestones, progressively revealing more on scroll (`Load more` button acts as a guard for `prefers-reduced-motion`).
- Uses GPU-friendly translate transforms for animations.

## Related Components

- `GoalSummaryCard` – trigger surface that launches the panel.
- `TeamMemberGoalsCard` – manager view wrapper that wires cards to the panel.
- Storybook stories at `Performance/GoalDetailPanel` showcase desktop, mobile, loading, and large datasets.
