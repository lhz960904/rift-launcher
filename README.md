# Rift

A macOS quick launcher in the spirit of Raycast / Alfred. Electron 33 + React 18 + TypeScript.

> macOS-only (Apple Silicon + Intel via universal binary). MVP — actively iterating.

## Install

Grab the latest `.dmg` (recommended) or `.zip` from the [Releases](https://github.com/lhz960904/rift-launcher/releases) page.

### First launch — read this if Gatekeeper blocks you

This build is **not yet code-signed by Apple**. The first time you open Rift, macOS will refuse with `"Rift" is damaged and can't be opened` or similar. Pick one workaround:

**Option A — GUI (recommended for non-developers)**

1. Drag `Rift.app` into `/Applications`
2. **Right-click** `Rift.app` → **Open** → click **Open** again in the dialog
3. After this one-time bypass, double-click works forever

**Option B — terminal one-liner**

```bash
xattr -cr /Applications/Rift.app
```

Removes the quarantine attribute, then double-click works immediately.

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
