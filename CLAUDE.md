# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Rift — macOS quick launcher (Raycast/Alfred-style) built on Electron 33 + React 18 + TypeScript. macOS-only, universal binary (arm64 + x64). Uses pnpm 10, Node 20+.

## Commands

```bash
pnpm dev           # electron-vite dev with HMR (main + preload + renderer)
pnpm build         # produce out/ (main + preload + renderer bundles); no packaging
pnpm start         # preview the production build (electron-vite preview)
pnpm typecheck     # tsc --noEmit on both tsconfig.node.json AND tsconfig.web.json
pnpm dist          # build + electron-builder --mac (universal dmg + zip into release/), no publish
pnpm dist:publish  # same, but --publish always (requires CI secrets)
```

There is **no test suite, no linter, no formatter** wired up. `pnpm typecheck` is the only static check. Single-test running does not apply.

The repo splits TypeScript into two projects: `tsconfig.node.json` covers `src/main/**` + `src/preload/**` + `electron.vite.config.ts`; `tsconfig.web.json` covers `src/renderer/**`. When changing tsconfigs, update both — `pnpm typecheck` runs both sequentially.

Dev vs. packaged differ deliberately: single-instance lock and auto-updater only activate in packaged builds, so `pnpm dev` can run alongside an installed copy without fighting over the global hotkey or state.

## Architecture

### Process layout (Electron 33, contextIsolation on, sandbox off in main)

- `src/main/` — Node main process; owns app lifecycle, window, tray, global hotkey, IPC, settings, app discovery.
- `src/preload/index.ts` — sandboxed preload; exposes a single typed `window.rift` surface via `contextBridge` and is the **only** place renderer touches Electron APIs.
- `src/renderer/` — Vite + React 18, no UI library; OKLCH design tokens in `src/renderer/src/styles/tokens.css`.
- `src/shared/rpc.ts` — RPC envelope types shared by main + preload.

### Main-process module system (`src/main/core/ModuleRegistry.ts`)

`src/main/index.ts` constructs a `ModuleRegistry`, registers each module by string key, then awaits `bootstrap()` on each in registration order. On `will-quit` it calls `shutdown()` in **reverse** order. Modules implement the `Module` interface (`bootstrap?`, `shutdown?`).

**Registration order is load-bearing**: `tray`, `hotkey`, `ipc` resolve other modules during their own bootstrap, so their dependencies must be registered (not necessarily bootstrapped) first. Constructors only stash `registry`; dependencies are resolved lazily inside method calls so circular references between modules (e.g. `HotkeyModule` ↔ `TrayModule`) work without ordering gymnastics. When adding a module, follow this pattern — never resolve a dependency in a constructor.

Current modules: `SettingsModule`, `AppsModule`, `UpdaterModule`, `WindowModule`, `TrayModule`, `HotkeyModule`, `IpcModule`.

### IPC: single-channel RPC envelope

All renderer→main calls go through one `ipcMain.handle('rpc', ...)` channel with a typed envelope (`RPC_CHANNEL`, `RpcRequest`, `RpcResponse` in `src/shared/rpc.ts`).

- `src/main/core/Rpc.ts` owns the dispatch table. Modules register handlers with `registerRpc('domain.method', handler)` (dot-notation, e.g. `apps.list`, `settings.set`). `IpcModule` is the **single registration point** — every handler lives in `IpcModule.bootstrap()` as a thin shim over a domain-module method; no business logic in `IpcModule`.
- The renderer never calls `ipcRenderer` directly. The preload exposes `window.rift` (typed as `RiftAPI`); renderer imports it via `src/renderer/src/lib/api.ts`. Errors come back as a thrown `RpcCallError` with `code` + `message` + remote stack.
- One-way **main→renderer pushes** (e.g. `launcher:show`, `launcher:hide`, `launcher:open-settings`, `launcher:update-ready`) keep their direct channel names — the envelope adds no value to fire-and-forget notifications. Subscribe via `subscribe(channel, cb)` in preload.
- Every RPC is logged: `[rpc] <method> ok|fail in <Nms> (req=<short>)`. Grep `req=<8 chars>` to trace a single call.
- A future plugin/multi-window era should add W3C-style `traceId` propagation; the design is documented in `docs/IPC.md` — do **not** implement it preemptively.

### App search index (`src/main/core/SearchIndex.ts`)

Disk-backed cache + Spotlight + chokidar incremental watcher.

1. Boot: `loadCache()` (sync) reads `userData/search-index.json` so the first `apps.list` returns instantly.
2. Background `rescan()`: prefers `mdfind` (`kMDItemContentType == "com.apple.application-bundle"`) over recursive `walk()`; diffs against cache by `mtimeMs`; re-extracts plist + 64×64 thumbnail only for changed entries; debounce-writes back to disk (500ms).
3. `startWatcher()`: chokidar on `SEARCH_ROOTS` (`/Applications`, `/System/Applications`, `/System/Applications/Utilities`, `~/Applications`) for incremental add/unlink. Watcher is started **after** the initial rescan to avoid double-processing.
4. `apps.rebuild` IPC clears cache and forces a full rescan (Settings → Refresh app index).

`SCHEMA_VERSION` (currently 2) is bumped when the on-disk shape changes incompatibly — old caches are silently discarded. Self (`dev.haoze.rift-launcher`) is filtered out of results so users never see two "Rift" entries; the bundle id must match `electron-builder.yml` `appId`.

`src/main/apps.ts` holds **stateless** primitives (`walkApps`, `readInfoPlist`, `parseAppName`, `extractIcon`, `findAppsViaMdfind`, `trackOpen`). All caching/scanning orchestration lives in `SearchIndex`. `AppsModule` is the renderer-facing facade that enriches `CachedEntry` (slim disk format) with per-user data (`aliases`, `mruCount`, `mruLastUsed`) into `AppEntry` (preload type).

### Window behavior (`WindowModule`)

Single frameless transparent BrowserWindow, 760×520, `alwaysOnTop: 'floating'`, visible on all workspaces incl. fullscreen. Three-state `toggle()`: hidden → show; visible-but-unfocused → focus; visible+focused → hide+`app.hide()` to yield focus. `blur` auto-hide is skipped during the first 200ms after `show()` (avoids self-hiding from focus thrash) and skipped entirely when DevTools are open in dev. Position is **per-display**: remembers the last user-dragged position keyed by `display.id` and falls back to centered/`Y_RATIO=0.20` if the remembered point no longer fits the work area. `move` events debounce 400ms before persisting.

### Settings persistence (`src/main/store.ts`)

Generic `JsonStore<T>` writes to `app.getPath('userData')/settings.json` (= `~/Library/Application Support/rift-launcher/settings.json`). Synchronous read on construction, write-through on every `set()`, pretty-printed JSON. `SettingsShape` includes `hotkey`, `theme`, `launchAtLogin`, `mru` (per-app `{count, lastUsed}`), `appAliases`, `windowPositions` (per-display).

`SettingsModule.bootstrap()` reconciles `launchAtLogin` against `app.getLoginItemSettings()` — the system is source of truth, since the user might have toggled it in System Settings while the app was off.

### Hotkey + Tray

`HotkeyModule.register(accelerator)` unregisters the previous accel before registering the new one and returns `{ ok, error? }` — `globalShortcut.register` can fail if another app owns the combo. After every (un)registration the tray menu is rebuilt so the displayed accelerator stays in sync. Default is `Alt+Cmd+Space`.

`TrayModule` uses a base64-embedded template image (16×16 + 32×32 retina) so no PNG file shipping is required. Tray icons are regenerable via `scripts/generate-icon.py`. The "Check for updates / Downloading… / Restart to install" menu item is rebuilt on every `UpdaterModule` state change — `UpdaterModule` calls `tray.rebuildMenu()` directly.

### Auto-update (`UpdaterModule`)

Wraps `electron-updater`. `autoDownload = true`. `WindowModule.show()` calls `maybeCheck()` which throttles to one check per 30 minutes. On `update-downloaded` the renderer gets a `launcher:update-ready` push and a system notification fires. Skipped entirely in non-packaged builds.

**Known limitation under ad-hoc signing**: `quitAndInstall()` fails Squirrel.Mac's signature verification because every ad-hoc build has a different Designated Requirement hash. Detection + download work; install is blocked until proper Apple Developer ID + notarization. The full migration plan is in `docs/SIGNING.md` — do not patch around it without a real Developer ID.

### Renderer (`src/renderer/src/`)

`App.tsx` is a 2-view switcher (`launcher` ↔ `settings`) driven by main-process pushes (`onShow`, `onOpenSettings`). No router. Theme is set via `data-theme` attribute on `<html>`.

Search scoring lives in `src/renderer/src/lib/score.ts` — adapted from kunkun/Bits UI command-score with launcher-tuned weights (prefix bonus, word-jump bonus, distance penalty), diacritics-normalized (`"cafe"` matches `"Café"`). MRU adds a logarithmic boost (~+25% for ~10 opens). Filter threshold is `SCORE_THRESHOLD = 0.05`. Empty query falls back to MRU-sorted top 50.

## macOS specifics

- **App Management permission (macOS 14+)** is required to launch any app from `/Applications`. Without it `shell.openPath` silently fails / triggers a system dialog. Onboarding for this is planned for v0.4 (see `docs/PERMISSIONS.md`); until then users must grant it manually under System Settings → Privacy & Security → App Management.
- **First-launch Gatekeeper block**: this build is ad-hoc signed (`identity: '-'`), so Gatekeeper blocks first launch. Workaround: `xattr -cr /Applications/Rift.app`. Documented in README.
- **Permission tiers and per-API specifics** (which need an app restart vs. take effect immediately, how to deep-link to System Settings panes, `node-mac-permissions` notes) live in `docs/PERMISSIONS.md`.
- The app is **dock-less and tray-only** (`app.dock?.hide()`, `Menu.setApplicationMenu(null)`, `window-all-closed` no-op).

## Build + release

- `electron-vite` configures three targets in `electron.vite.config.ts`: `main` and `preload` use `externalizeDepsPlugin()` (deps stay in `node_modules`/asar); `renderer` uses `@vitejs/plugin-react`. Output: `out/main/`, `out/preload/`, `out/renderer/`.
- `electron-builder.yml` produces a universal arm64+x64 dmg + zip into `release/`. `asar: true`. `publish.provider: github` so `electron-builder --publish always` uploads artifacts to GitHub Releases.
- `pnpm.onlyBuiltDependencies` is restricted to `electron` + `esbuild` — only those two packages are allowed to run install scripts.
- **Release flow**: bump `version` in `package.json`, commit, `git tag vX.Y.Z`, `git push origin main --tags`. `.github/workflows/release.yml` catches the tag, runs on `macos-latest`, and publishes the dmg + zip.
- chokidar (a transitive runtime dep) had to be explicitly listed under `dependencies` to ship inside the asar — see commit `9cf2c4a`. When adding any runtime dep used by the main process, double-check it ends up in `out/` after `pnpm dist`, not just in dev.

## Reference docs

- `docs/IPC.md` — RPC envelope rationale + future traceId design.
- `docs/PERMISSIONS.md` — macOS permission tiers, per-permission UX, deep-link URIs.
- `docs/SIGNING.md` — Apple Developer ID + notarization migration plan (auto-update unblock).
- `docs/REFERENCES.md` — design references and inspiration.

## Conventions

- **Comments**: default to none. Existing files have one short doc comment at the top of each module/class explaining the *why* and the wider invariant; do not add per-method JSDoc paragraphs. Only explain non-obvious *why* (hidden constraint, subtle invariant, workaround). Never explain *what* the code does. Don't add task-context comments ("added for X flow") or `// removed` tombstones.
- **Logging**: `console.log` with a `[<subsystem>]` prefix (e.g. `[rift]`, `[rpc]`, `[searchindex]`, `[updater]`, `[renderer]`). Renderer console messages are forwarded to main's stdout via `webContents.on('console-message', ...)`.
- **Renderer ↔ main type sharing**: renderer imports types directly from `src/preload/index.ts` (`RiftAPI`, `AppEntry`, `Settings`) via relative path. Don't duplicate these shapes in renderer code.
- **Icons / colors**: no UI lib. Inline SVGs in `src/renderer/src/lib/icons.tsx`. Color tokens in `src/renderer/src/styles/tokens.css` (OKLCH).
