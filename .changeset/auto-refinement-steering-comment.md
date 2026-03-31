---
"@gsxdsm/fusion": minor
---

Auto-create refinement task when steering comment added to done task

When a user adds a steering comment to a task in the "done" column, kb now automatically creates a refinement task with the comment text as feedback. This streamlines the feedback-to-action loop, allowing post-completion feedback to immediately spawn a follow-up refinement task. Only user-authored comments trigger auto-refinement; agent-authored comments do not.
