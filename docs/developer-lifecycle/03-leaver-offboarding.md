# Leaver — Developer Offboarding

Run this the same day a departure is confirmed — not at end of notice
period, not "when we get to it." Everything a joiner was granted in
[01-joiner-onboarding.md](01-joiner-onboarding.md) has a matching revocation
step here.

This is distinct from the **employee** JML Leaver process (marking an HR
record `inactive` — see `docs/ENTERPRISE-GOVERNANCE-AND-JML.md` §7.4, which
today is manual and has no automated reconciliation). A developer leaving
triggers *both* processes if they were also an employee record in the app.

## Immediate (day of departure is known)

- [ ] **GitHub** — remove from the `infosrv-zenith-hr-pulse` repo and any
      org teams. If they held `admin`/`maintain`, reassign any
      branch-protection or `CODEOWNERS` entries naming them individually.
- [ ] **AWS** — deactivate/delete any personal IAM user or role assigned per
      [access-matrix.md](access-matrix.md). This is separate from and
      unrelated to the CI's own AWS credentials, which they should never
      have held (§3 of the joiner doc) — confirm that's true; if it isn't,
      **rotate `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`** in the GitHub
      Actions secrets immediately, for every affected stage.
- [ ] **Azure Entra ID** — this is IT's responsibility as part of the
      employee offboarding, but confirm it happened: a disabled Entra
      account is what actually kills their ability to obtain a fresh app JWT
      (`backend/app/security.py` JWKS validation will then fail for them on
      next token refresh). Note: an **already-issued** app JWT stays valid
      for up to its remaining TTL (15 minutes,
      `backend/app/security.py:ACCESS_TOKEN_EXPIRE_MINUTES`) — there is no
      server-side session revocation today (see production readiness
      assessment, Authentication §1, "Session management"). For a
      high-risk departure, this 15-minute window is a known gap, not
      something this checklist can close by itself.
- [ ] **App admin access** — if they were an HR-app admin (row in
      `zenith-hr-admin-{stage}`), remove via `DELETE /api/employees/admins/{id}`
      by another admin, or directly if no other admin is available. Check
      both `staging` and `prod` tables.
- [ ] **Secrets they held locally** — `SECURITY_SECRET_KEY` values, any
      `.env*` files with staging/prod-adjacent values, any AWS credential
      files (`~/.aws/credentials`). These can't be "revoked" remotely if
      they were ever shared — if any real secret was ever handed to this
      person outside of their own local-dev-only value (see joiner §2, which
      should have been self-generated and dev-only), **rotate it**.

## Within the week

- [ ] **Slack/Teams** — remove from project channels/groups.
- [ ] **CI/CD** — if they were listed anywhere as a required reviewer, in
      `CODEOWNERS`, or as an approver on a deploy gate, remove them.
- [ ] **Transfer ownership** — anything solely "owned" by this person:
      open PRs (reassign or close), draft docs, in-progress migration
      scripts (`backend/app/scripts/`), any external service they were the
      sole admin of (e.g. an AWS Bedrock/ECR console access grant, a
      third-party dashboard).
- [ ] **Knowledge handoff** — capture anything living only in their head:
      undocumented deploy quirks, why a workaround exists, where the "one
      more thing" env var comes from. Add it to
      [kt-technical-guide.md](kt-technical-guide.md) or the relevant doc —
      don't let it leave with them.

## Verification

- [ ] Confirm in GitHub org member list they no longer appear.
- [ ] Confirm in AWS IAM they hold no active access keys.
- [ ] Confirm (with IT) their Entra account is disabled.
- [ ] Confirm they are not listed in `zenith-hr-admin-staging` or
      `zenith-hr-admin-prod`.
- [ ] Log the offboarding date and what was revoked — this becomes the
      audit trail for the next access review (see production readiness
      assessment, Governance §16).

## Known gap (be honest about it)

There is currently **no automated deprovisioning**: nothing in this repo
detects a departed Entra user and revokes their access automatically. This
checklist is the only control until the reconcile-pass recommended in
`docs/ENTERPRISE-GOVERNANCE-AND-JML.md` (§8, item #1/#8 — "Leaver
auto-deactivation") is built. Treat every offboarding as fully manual until
then.
