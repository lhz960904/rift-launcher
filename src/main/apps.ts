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
  icon: string | null  // data URL (data:image/png;base64,...)
  aliases: string[]
  mruCount: number
  mruLastUsed: number
}

const SEARCH_ROOTS = [
  '/Applications',
  '/System/Applications',
  '/System/Applications/Utilities',
  join(homedir(), 'Applications')
]

let cache: AppEntry[] | null = null
let scanning: Promise<AppEntry[]> | null = null

async function walkApps(root: string, depth = 2): Promise<string[]> {
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

async function readInfoPlist(appPath: string): Promise<Record<string, unknown> | null> {
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

async function extractIcon(appPath: string): Promise<string | null> {
  try {
    const img = await nativeImage.createThumbnailFromPath(appPath, { width: 64, height: 64 })
    if (!img.isEmpty()) return img.toDataURL()
  } catch {
    // fall through
  }
  return null
}

async function findAppsViaMdfind(): Promise<string[]> {
  try {
    const { stdout } = await pExecFile(
      'mdfind',
      ['kMDItemContentType == "com.apple.application-bundle"'],
      { maxBuffer: 10 * 1024 * 1024 }
    )
    return stdout
      .split('\n')
      .filter(Boolean)
      // strip nested .app inside another bundle (helpers/frameworks/embedded)
      .filter((p) => !p.includes('.app/Contents/'))
  } catch {
    return []
  }
}

async function scan(): Promise<AppEntry[]> {
  const t0 = Date.now()
  let paths = await findAppsViaMdfind()
  let source = 'mdfind'
  if (paths.length === 0) {
    source = 'walk'
    for (const root of SEARCH_ROOTS) {
      const found = await walkApps(root)
      paths.push(...found)
    }
  }
  const unique = Array.from(new Set(paths))
  console.log(`[rift] scan: ${source} found ${unique.length} apps in ${Date.now() - t0}ms`)

  const concurrency = 8
  const results: AppEntry[] = []
  let i = 0
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < unique.length) {
        const idx = i++
        const p = unique[idx]
        const info = await readInfoPlist(p)
        if (!info) continue
        const name =
          (info['CFBundleDisplayName'] as string) ||
          (info['CFBundleName'] as string) ||
          basename(p, '.app')
        const icon = await extractIcon(p)
        results.push({ id: p, name, path: p, icon, aliases: [], mruCount: 0, mruLastUsed: 0 })
      }
    })
  )
  results.sort((a, b) => a.name.localeCompare(b.name))
  console.log(`[rift] scan complete: ${results.length} apps in ${Date.now() - t0}ms`)
  return results
}

async function getCachedScan(force = false): Promise<AppEntry[]> {
  if (cache && !force) return cache
  if (scanning) return scanning
  scanning = scan().then((r) => {
    cache = r
    scanning = null
    return r
  })
  return scanning
}

export async function listApps(force = false): Promise<AppEntry[]> {
  const raw = await getCachedScan(force)
  const settings = getSettings().store
  const mru = settings.mru || {}
  const aliases = settings.appAliases || {}
  return raw.map((e) => {
    const m = mru[e.id]
    return {
      ...e,
      aliases: aliases[e.id] || [],
      mruCount: m?.count || 0,
      mruLastUsed: m?.lastUsed || 0
    }
  })
}

export function trackOpen(appId: string): void {
  const s = getSettings()
  const mru = { ...(s.get('mru') || {}) }
  const prev = mru[appId] || { count: 0, lastUsed: 0 }
  mru[appId] = { count: prev.count + 1, lastUsed: Date.now() }
  s.set('mru', mru)
}
