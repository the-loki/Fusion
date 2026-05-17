---
"@runfusion/fusion": minor
---

Add hybrid master-key resolver (`MasterKeyManager`) backing the upcoming secrets subsystem. Tries the OS keychain via optional `keytar` dependency, falls back to a `0600` `~/.fusion/master.key` file.
