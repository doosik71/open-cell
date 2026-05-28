# AGENTS.md

This file defines repository-level working rules for agents contributing to `mobile-ppg`.

## Think Before Coding

- Respect the project goal described in `README.md`: keep the Python and Kotlin pipelines aligned, and preserve the shared KMP architecture across `core-*`, Android, and Desktop modules.
- Never silently assume requirements.
- If requirements, intent, or expected behavior are ambiguous, ask before implementing.
- Surface tradeoffs before coding when they could materially affect architecture, UX, data flow, model behavior, file layout, or tests.
- Do not hide confusion or uncertainty.
- When proceeding with a reasonable assumption, state that assumption explicitly in the final report.

## Simplicity First

- Prefer the simplest solution that solves the task.
- Do not introduce abstractions prematurely.
- Avoid speculative generalization, bloated APIs, and unnecessary flexibility.
- If a small change works, do not replace it with a large framework or rewrite.

## Surgical Changes

- Modify only files relevant to the task.
- Avoid drive-by refactors and unrelated rewrites.
- Do not overwrite or revert unrelated user changes.
- Preserve existing architecture and comments unless a change is required or the comment is incorrect.
- When touching cross-platform logic, consider the impact on Android, Desktop, Python validation flows, and shared test assets.

## Goal-Driven Execution

- Define a clear, verifiable success target before making substantial changes.
- Prefer the narrowest useful verification first.
- For build or runtime fixes, verify with the real script or command the user runs when practical.
- If verification is blocked by environment constraints, state exactly what was blocked and what remains unverified.
- Do not introduce placeholder implementations without clearly labeling their limitation and rationale.
- If a platform-specific dependency does not work in another target, document the constraint and choose an implementation that keeps the project buildable.

## Commit Message Rules

- Write commit messages in clear English.
- Use an imperative subject line.
- Keep the subject concise and specific to the actual change.
- Avoid vague subjects such as `fix stuff`, `update code`, or `changes`.
- Prefer the repository's established style:

```text
Add desktop fallback runner and fix activation exit code

- return success explicitly from `bin/activate.bat` so launcher scripts do not
  treat successful activation as a failure
- replace Android-only Desktop LiteRT usage with a JVM-safe fallback runner so
  `app-desktop` can compile and run
- keep model-file existence checks so missing Desktop assets still fail fast
```

- When useful, follow the subject with short bullet points describing what changed, why it changed, and any important constraint or compatibility note.
- Make the commit message match the actual diff, not the intended plan.
