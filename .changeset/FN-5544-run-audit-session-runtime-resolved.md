---
"@runfusion/fusion": patch
---

Add `session:runtime-resolved` run-audit event (FN-5544) emitted from `createResolvedAgentSession` for per-lane provider/runtime/model attribution. Additive surface; existing events unchanged. Replaces the diagnostic-log workaround introduced by FN-5206.
