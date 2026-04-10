---
"@gsxdsm/fusion": patch
---

Add lint quality gate and update agent prompts to enforce lint-fix behavior

This change adds a repository-owned ESLint configuration (`pnpm lint`) and updates the executor and triage agent prompts to treat lint failures as blocking completion criteria, matching how tests and typecheck are currently handled.

**Changes:**
- Add ESLint configuration with TypeScript support
- Add `pnpm lint` command to package.json
- Add lint step to CI workflow
- Update executor prompts to require lint pass before `task_done()`
- Update triage prompts to include lint check in Testing & Verification step
- Update completion criteria to include lint passing

Agents now treat lint failures as blocking, consistent with test and typecheck failures.
