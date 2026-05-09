/**
 * apps.ts — pure helpers for macOS app discovery.
 *
 * Stateless utility module. Cache, scanning orchestration, and disk
 * persistence live in SearchIndex (see core/SearchIndex.ts) which uses
 * these helpers as primitives.
 *
 * AppEntry is the shape consumed by the renderer (includes alias/MRU
 * enrichment). CachedEntry (in SearchIndex) is the slimmer disk format.
 */
import { promises as fs } from 'node:fs'
import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import plist from 'plist'
import { nativeImage } from 'electron'
import { getSettings } from './store'

const pExecFile = promisify(execFile)

export type AppEntry = {
  id: string
  name: string
  path: string
  icon: string | null // data URL (data:image/png;base64,...)
  aliases: string[]
  mruCount: number
  mruLastUsed: number
}

export const SEARCH_ROOTS = [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities',
  join(homedir(), 'Applications')
]

/** Recursive walk fallback when Spotlight is unavailable. */
export async function walkApps(root: string, depth = 2): Promise<string[]> {
  const out: string[] = []
  let entries: import('node:fs').Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch {
    return out
  }
  for (const ent of entries) {
    const full = join(root, ent.name)
    if (ent.name.endsWith('.app')) {
      out.push(full)
    } else if (ent.isDirectory() && depth > 0) {
      const nested = await walkApps(full, depth - 1)
      out.push(...nested)
    }
  }
  return out
}

/** Parse Info.plist (handles binary plist via plutil → xml1). */
export async function readInfoPlist(
  appPath: string
): Promise<Record<string, unknown> | null> {
  const xml = join(appPath, 'Contents', 'Info.plist')
  if (!existsSync(xml)) return null
  try {
    const buf = await fs.readFile(xml)
    if (buf[0] === 0x62 && buf[1] === 0x70) {
      const { stdout } = await pExecFile('plutil', ['-convert', 'xml1', '-o', '-', xml])
      return plist.parse(stdout) as Record<string, unknown>
    }
    return plist.parse(buf.toString('utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Resolve display name with the same precedence Finder uses. */
export function parseAppName(path: string, info: Record<string, unknown>): string {
  return (
    (info['CFBundleDisplayName'] as string) ||
    (info['CFBundleName'] as string) ||
    basename(path, '.app')
  )
}

/** 64x64 thumbnail via NSWorkspace → data URL. */
export async function extractIcon(appPath: string): Promise<string | null> {
  try {
    const img = await nativeImage.createThumbnailFromPath(appPath, { width: 64, height: 64 })
    if (!img.isEmpty()) return img.toDataURL()
  } catch {
    // fall through
  }
  return null
}

/** Spotlight-backed app discovery (much faster than fs walk). */
export async function findAppsViaMdfind(): Promise<string[]> {
  try {
    const { stdout } = await pExecFile(
      'mdfind',
      ['kMDItemContentType == "com.apple.application-bundle"'],
      { maxBuffer: 10 * 1024 * 1024 }
    )
    return stdout
      .split('\n')
      .filter(Boolean)
      // Strip nested .app inside another bundle (helpers/frameworks/embedded)
      .filter((p) => !p.includes('.app/Contents/'))
  } catch {
    return []
  }
}

/** Bump MRU counter when user opens an app (write-through to settings.json). */
export function trackOpen(appId: string): void {
  const s = getSettings()
  const mru = { ...(s.get('mru') || {}) }
  const prev = mru[appId] || { count: 0, lastUsed: 0 }
  mru[appId] = { count: prev.count + 1, lastUsed: Date.now() }
  s.set('mru', mru)
}
