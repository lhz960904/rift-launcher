import type { Module } from '../core/ModuleRegistry'
import { listApps, trackOpen, type AppEntry } from '../apps'

/**
 * AppsModule — facade over apps.ts (mdfind scan + nativeImage extract +
 * MRU enrich). Stateless wrapper for now; SearchIndex caching moves here
 * in v0.4.B.
 */
export class AppsModule implements Module {
  bootstrap(): void {
    // no-op for now; SearchIndex eager-load + watcher land in v0.4.B
  }

  list(force = false): Promise<AppEntry[]> {
    return listApps(force)
  }

  trackOpen(appId: string): void {
    trackOpen(appId)
  }
}
