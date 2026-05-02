---
"@runfusion/fusion": patch
---

Fix engine startup creating a spurious `.fusion/.fusion/fusion.db` under each project root. The in-process runtime was passing the project's `.fusion` directory to PluginStore, which internally appends `.fusion` again, producing a nested empty database alongside the real one. PluginStore now receives the project root, matching every other call site.
