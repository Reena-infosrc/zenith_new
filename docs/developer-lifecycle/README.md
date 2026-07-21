# Developer Lifecycle — Joiner / Mover / Leaver (JML)

This folder is the operational counterpart to the *employee* JML process
(which governs HR records inside the app) — it governs **developer access**
to the systems that build, ship, and run Zenith HR Pulse: GitHub, AWS,
Azure Entra ID, and the deployment pipeline.

No developer JML process existed before this folder. Treat every document
here as a starting SOP — refine it as the team's actual tooling (Slack,
ticketing, IdP groups) gets wired in.

## Documents

| Doc | Use it when |
|---|---|
| [01-joiner-onboarding.md](01-joiner-onboarding.md) | A new developer joins the project |
| [02-mover-role-change.md](02-mover-role-change.md) | An existing developer's role, scope, or access needs change |
| [03-leaver-offboarding.md](03-leaver-offboarding.md) | A developer leaves the project or company |
| [access-matrix.md](access-matrix.md) | Quick-reference table: every system a developer might touch, what access looks like, who owns granting/revoking it |
| [kt-technical-guide.md](kt-technical-guide.md) | The actual KT content — architecture, key modules, how the pieces fit, where things live |

## Principles

1. **Least privilege by default.** Grant the narrowest access that lets the
   person do this week's work; widen on request, not preemptively.
2. **Every grant has an owner and a reason.** If you can't say who approved
   an access grant and why, it shouldn't exist.
3. **Leaver is not optional and not "eventually."** Access revocation starts
   the same day a departure is known, not at end of notice period.
4. **Joiner and Leaver are symmetric.** Whatever the joiner checklist grants,
   the leaver checklist must revoke. If you add a new system to onboarding,
   add its teardown to offboarding in the same change.
5. **This is a checklist, not a memory test.** If a step isn't written down
   here, assume it won't happen under time pressure.
