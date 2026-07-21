// Conventional Commits gate. Enforced by the local `commitlint` hook in
// .pre-commit-config.yaml (commit-msg stage) and should also run in CI.
// Format: type(scope): subject   e.g. fix(directory): stop spinner hanging
module.exports = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat", // new capability
        "fix", // bug fix
        "perf", // performance improvement
        "refactor", // code change, no behavior change
        "docs", // documentation only
        "chore", // tooling, config, deps, no src behavior change
        "test", // adding or correcting tests
        "ci", // CI/CD pipeline changes
        "build", // build system, packaging, infra-as-code
        "revert", // reverts a previous commit
      ],
    ],
    "subject-case": [0], // codebase mixes casing in existing history; don't block on this
  },
};
