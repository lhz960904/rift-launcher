import type { Module } from '../core/ModuleRegistry'
import { SearchIndex } from '../core/SearchIndex'
import { trackOpen, type AppEntry } from '../apps'
import { getSettings } from '../store'

/**
 * AppsModule — owns the SearchIndex (disk-backed app cache + chokidar
 * watcher) and enriches CachedEntry with per-user data (aliases / MRU)
 * before returning to the renderer.
 *
 * Boot:
 *   sync   loadCache → first listApps() returns instantly
 *   async  rescan → diff with disk against live mdfind → write back
 *   async  startWatcher → chokidar fires fs events → incremental
 */
export class AppsModule implements Module {
  private index = new SearchIndex()

  bootstrap(): void {
    this.index.loadCache()
    // Background: rescan first, then start watcher (avoid double-processing
    // the initial mdfind set against fresh chokidar `add` events).
    void this.index.rescan().then(() => this.index.startWatcher())
  }

  async shutdown(): Promise<void> {
    await this.index.stop()
  }

  /** Returns enriched AppEntry list synchronously from cache. */
  list(): AppEntry[] {
    const settings = getSettings().store
    const mru = settings.mru || {}
    const aliases = settings.appAliases || {}
    return this.index.entries().map((e) => {
      const m = mru[e.id]
      return {
        ...e,
        aliases: aliases[e.id] || [],
        mruCount: m?.count || 0,
        mruLastUsed: m?.lastUsed || 0
      }
    })
  }

  /** Manual cache invalidation — clears + full rescan + writes. */
  rebuild(): Promise<{ count: number }> {
    return this.index.rebuild()
  }

  trackOpen(appId: string): void {
    trackOpen(appId)
  }
}
