/**
 * SearchIndex — disk-backed app metadata cache + chokidar incremental watcher.
 *
 * Boot flow (sync, fast):
 *   1. loadCache() reads userData/search-index.json into memory (~30ms for ~400 apps)
 *   2. AppsModule.list() can return cached entries immediately — renderer
 *      sees the launcher fully populated on first hotkey press
 * Background (async):
 *   3. rescan() runs mdfind, diffs against cache by mtime, re-processes only
 *      changed entries, debounce-writes back to disk
 *   4. startWatcher() registers chokidar on SEARCH_ROOTS for fs add/unlink
 *      events → applies incremental updates as user installs/removes apps
 *
 * Manual rebuild: rebuild() clears cache and runs a full rescan — exposed as
 * the `apps:rebuild` IPC for the "Refresh app index" Settings button. Escape
 * hatch for the rare cases where chokidar misses an event (rename without
 * mtime change, system icon refresh, etc.).
 */
import { promises as fs, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import chokidar, { type FSWatcher } from 'chokidar'
import {
  SEARCH_ROOTS,
  extractIcon,
  findAppsViaMdfind,
  parseAppName,
  parseUrlSchemes,
  readInfoPlist,
  walkApps
} from '../apps'

// Bump when the on-disk shape changes incompatibly — load() will discard
// caches with a different version and the next rescan rebuilds them.
// v3 (2026-05-13): added urlSchemes for URL-handler detection.
const SCHEMA_VERSION = 3
const WRITE_DEBOUNCE_MS = 500
// Bundle id of Rift itself — used to filter self out of search results so
// users never see two "Rift" entries (one in /Applications, one in any
// dist build directory mdfind happens to know about). Must match
// electron-builder.yml `appId`.
const SELF_BUNDLE_ID = 'dev.haoze.rift-launcher'

export type CachedEntry = {
  id: string
  name: string
  path: string
  icon: string | null
  urlSchemes: string[]
  mtimeMs: number
}

type CacheFile = {
  version: number
  indexedAt: number
  entries: CachedEntry[]
}

export class SearchIndex {
  private cache: Map<string, CachedEntry> = new Map()
  private watcher: FSWatcher | null = null
  private writeTimer: NodeJS.Timeout | null = null
  private cachePath: string

  constructor() {
    this.cachePath = join(app.getPath('userData'), 'search-index.json')
  }

  /** Synchronous boot — eager-load disk cache so renderer sees apps instantly. */
  loadCache(): void {
    if (!existsSync(this.cachePath)) {
      console.log('[searchindex] no disk cache, will scan on bootstrap')
      return
    }
    const t0 = Date.now()
    try {
      const data = JSON.parse(readFileSync(this.cachePath, 'utf8')) as CacheFile
      if (data.version !== SCHEMA_VERSION) {
        console.warn(
          `[searchindex] schema mismatch (got ${data.version}, want ${SCHEMA_VERSION}), discarding`
        )
        return
      }
      for (const e of data.entries) this.cache.set(e.id, e)
      console.log(`[searchindex] loaded ${this.cache.size} apps from disk in ${Date.now() - t0}ms`)
    } catch (e) {
      console.warn('[searchindex] cache load failed, discarding:', (e as Error).message)
    }
  }

  /** Currently cached entries — sync, no IO. */
  entries(): CachedEntry[] {
    return Array.from(this.cache.values()).sort((a, b) => a.name.localeCompare(b.name))
  }

  /** Background full rescan: mdfind → diff cache by mtime → re-process changed. */
  async rescan(): Promise<void> {
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
    const unique = new Set(paths)

    let removed = 0
    for (const id of Array.from(this.cache.keys())) {
      if (!unique.has(id)) {
        this.cache.delete(id)
        removed++
      }
    }

    let added = 0
    let updated = 0
    let unchanged = 0
    for (const p of unique) {
      let stat
      try {
        stat = await fs.stat(p)
      } catch {
        continue
      }
      const cached = this.cache.get(p)
      if (cached && cached.mtimeMs === stat.mtimeMs) {
        unchanged++
        continue
      }
      await this.upsert(p, stat.mtimeMs)
      cached ? updated++ : added++
    }

    console.log(
      `[searchindex] rescan via ${source}: ${unique.size} apps, +${added} ~${updated} -${removed} (=${unchanged}) in ${Date.now() - t0}ms`
    )

    if (added + updated + removed > 0) this.scheduleWrite()
  }

  /** Force full rebuild — clear cache + rescan + write. Exposed via IPC. */
  async rebuild(): Promise<{ count: number }> {
    this.cache.clear()
    await this.rescan()
    return { count: this.cache.size }
  }

  /** Set up chokidar to watch SEARCH_ROOTS for app install/uninstall events. */
  startWatcher(): void {
    if (this.watcher) return
    const dirs = SEARCH_ROOTS.filter((p) => existsSync(p))
    this.watcher = chokidar.watch(dirs, {
      depth: 2,
      ignored: (path) => path.includes('.app/Contents/'),
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 }
    })
    this.watcher
      .on('addDir', (p) => this.handleFsEvent('add', p))
      .on('unlinkDir', (p) => this.handleFsEvent('unlink', p))
      .on('error', (err) => console.error('[searchindex] watcher error:', err))
    console.log(`[searchindex] watching ${dirs.length} dirs for app changes`)
  }

  private async handleFsEvent(kind: 'add' | 'unlink', path: string): Promise<void> {
    if (!path.endsWith('.app')) return
    if (kind === 'add') {
      if (this.cache.has(path)) return
      let stat
      try {
        stat = statSync(path)
      } catch {
        return
      }
      await this.upsert(path, stat.mtimeMs)
      console.log('[searchindex] +', this.cache.get(path)?.name)
      this.scheduleWrite()
    } else {
      const e = this.cache.get(path)
      if (!e) return
      this.cache.delete(path)
      console.log('[searchindex] -', e.name)
      this.scheduleWrite()
    }
  }

  /** Read info.plist + icon for a path, store in cache. */
  private async upsert(path: string, mtimeMs: number): Promise<void> {
    const info = await readInfoPlist(path)
    if (!info) return
    if (info['CFBundleIdentifier'] === SELF_BUNDLE_ID) return // can't launch self
    const name = parseAppName(path, info)
    const urlSchemes = parseUrlSchemes(info)
    const icon = await extractIcon(path)
    this.cache.set(path, { id: path, name, path, icon, urlSchemes, mtimeMs })
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => void this.writeNow(), WRITE_DEBOUNCE_MS)
  }

  private async writeNow(): Promise<void> {
    const data: CacheFile = {
      version: SCHEMA_VERSION,
      indexedAt: Date.now(),
      entries: Array.from(this.cache.values())
    }
    try {
      await fs.writeFile(this.cachePath, JSON.stringify(data))
      console.log(`[searchindex] wrote ${data.entries.length} entries to disk`)
    } catch (e) {
      console.error('[searchindex] write failed:', (e as Error).message)
    }
    this.writeTimer = null
  }

  async stop(): Promise<void> {
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      await this.writeNow()
    }
    if (this.watcher) {
      await this.watcher.close()
      this.watcher = null
    }
  }
}
