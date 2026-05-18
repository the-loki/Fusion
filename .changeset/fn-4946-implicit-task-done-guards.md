---
"@runfusion/fusion": patch
---

Extend FN-4851 fn_task_done refusal guards (pending-code-review-revise, bulk-step-completion-without-review) to the implicit-completion path so agents cannot bypass them by drip-marking every step done via fn_task_update and exiting without calling fn_task_done. Implicit refusals share the existing requeue budget and escalate to in-review on exhaustion.
