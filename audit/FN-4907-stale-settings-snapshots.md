# FN-4907 stale settings snapshot audit

## Scope
- packages/core settings stores (`GlobalSettingsStore`, `TaskStore`, `CentralCore`)
- dashboard settings writers/routes
- engine peer exchange settings payload cache
- direct global settings writers (`daemon-token`, `first-run`)

## Methodology
- Grep patterns used:
  - `getSettings`, `getSettingsFast`, `getSettingsByScope`, `getSettingsByScopeFast`
  - `updateSettings`, `updateGlobalSettings`
  - `cachedSettings`, `invalidateCache`, `invalidateAllGlobalSettingsCaches`
  - `cachedSettingsPayload`, `cachedSharedStatePayload`
- Candidate set: all matches under `packages/core`, `packages/engine`, `packages/dashboard`, `packages/cli` excluding `__tests__`.

## Write-path ↔ cache invariants (initial inventory)

| Write site | Cache / snapshot that must refresh | Current invalidation behavior |
|---|---|---|
| `GlobalSettingsStore.updateSettings()` (`packages/core/src/global-settings.ts`) | Same-instance `cachedSettings` | Write-through (`cachedSettings = withDefaults`) on update; no cross-instance fanout |
| `TaskStore.updateGlobalSettings()` (`packages/core/src/store.ts`) | task-store merged settings readers + per-instance global cache | Delegates to `globalSettingsStore.updateSettings()` and emits `settings:updated`; no automatic invalidation of other TaskStore instances |
| `TaskStore.updateSettings()` (`packages/core/src/store.ts`) | project config snapshots / settings listeners | Writes config and emits `settings:updated` |
| `CentralCore.applyRemoteSettings()` project merge path (`packages/core/src/central-core.ts`) | project `TaskStore` caches/listeners for affected projects | Uses `updateProject(...{settings})` directly (no `TaskStore.updateSettings()` event fanout) |
| `settings-export` import (`packages/core/src/settings-export.ts`) | global/project settings caches | Uses `TaskStore.updateGlobalSettings()` / `TaskStore.updateSettings()` (evented path) |
| Dashboard `PUT /settings/global` (`register-settings-memory-routes.ts`) | all cached project stores + active engine store + peer exchange payload | Calls `invalidateAllGlobalSettingsCaches()` and engine task-store cache invalidation after update |
| Dashboard auth toggle routes (`register-auth-routes.ts`) | same as above | Calls `invalidateAllGlobalSettingsCaches()` and engine-store invalidation after each global write |
| Dashboard custom-provider CRUD (`register-custom-provider-routes.ts`) | same as above | **No explicit cache invalidation after `updateGlobalSettings()`** (candidate stale-cache risk) |
| Settings sync inbound `POST /settings/sync-receive` (`register-settings-sync-inbound-routes.ts`) | global settings caches + project store listeners | Calls `central.applyRemoteSettings(...)`; global application handled separately in route; project merge currently bypasses `TaskStore.updateSettings()` |
| `PeerExchangeService.updateGlobalSettings()` (`packages/engine/src/peer-exchange-service.ts`) | `cachedSettingsPayload`, `cachedSharedStatePayload` | Explicitly nulls both caches; effectiveness depends on callers invoking it |
| `DaemonTokenManager.rotateToken*` (`packages/core/src/daemon-token.ts`) | other `GlobalSettingsStore` instances reading `daemonToken` | Writes via its private `GlobalSettingsStore` only; no cross-instance invalidation |
| `FirstRunExperience.completeSetup()` (`packages/core/src/first-run.ts`) | other global settings store instances reading `setupComplete` | Writes via private `GlobalSettingsStore`; no cross-instance invalidation |
