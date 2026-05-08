# Rift

A macOS quick launcher in the spirit of Raycast / Alfred. Electron 33 + React 18 + TypeScript.

> macOS-only (Apple Silicon + Intel via universal binary). MVP — actively iterating.

## Install

Grab the latest `.dmg` (recommended) or `.zip` from the [Releases](https://github.com/lhz960904/rift-launcher/releases) page.

### First launch — read this if Gatekeeper blocks you

This build is **not yet code-signed by Apple**. macOS will block first launch with:

> *"Apple could not verify 'Rift' is free of malware..."*

(or on older macOS: *"Rift is damaged and can't be opened"*). Pick one workaround:

**Option A — terminal one-liner (recommended, works on every macOS version)**

```bash
xattr -cr /Applications/Rift.app
```

Removes the quarantine attribute. Then double-click works immediately.

**Option B — System Settings (no terminal)**

1. Drag `Rift.app` to `/Applications`
2. Double-click once (will get blocked, dismiss the dialog)
3. Open **System Settings → Privacy & Security**
4. Scroll to the bottom — you'll see *"Rift was blocked from use because it is not from an identified developer"*
5. Click **Open Anyway** → enter password
6. Double-click Rift again → click **Open** in the new dialog

> Note: on macOS Sequoia (15+), the old "right-click → Open" trick no longer works. Use Option A or B.

## Usage

| Action | Shortcut |
|---|---|
| Toggle launcher | `⌥⌘ Space` (default; rebindable in Settings) |
| Navigate results | `↑` / `↓` |
| Open selected | `↵` |
| Dismiss | `Esc` |
| Open settings | `⌘ ,` |

Frequently-used apps automatically rank higher (MRU). You can also add custom aliases (data structure ready; UI coming in v0.3).

## Development

```bash
pnpm install
pnpm dev          # hot-reload dev mode
pnpm start        # preview production build
pnpm build        # build only (no package)
pnpm dist         # build + package .dmg + .zip into release/ (no publish)
pnpm typecheck
```

Requires Node 20+ and pnpm 10.

## Release

```bash
# bump version in package.json (e.g., 0.1.0 → 0.2.0), then:
git commit -am "chore: release v0.2.0"
git tag v0.2.0
git push origin main --tags
```

GitHub Actions (`.github/workflows/release.yml`) catches the tag, builds on `macos-latest`, and publishes the `.dmg` + `.zip` artifacts to a new GitHub Release automatically.

## Stack

- **Runtime**: Electron 33, contextIsolation + sandboxed preload
- **UI**: React 18 + custom OKLCH design tokens (no UI lib)
- **Build**: electron-vite (Vite for renderer + esbuild for main/preload)
- **Search**: in-memory fuzzy with MRU weighting
- **App index**: `walk(/Applications)` + `nativeImage.createThumbnailFromPath()` for icons
- **Persistence**: JSON file under `~/Library/Application Support/rift-launcher/`
- **Packaging**: electron-builder (universal arm64+x64 dmg/zip)
