import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Module } from '../core/ModuleRegistry'

type Bag = Record<string, unknown>

/**
 * PluginStorageModule — namespaced JSON persistence for plugins.
 *
 * One file per namespace under `userData/plugin-storage/<ns>.json`. Each
 * namespace is a flat key→value bag (JSON-serializable). Plugin authors
 * choose their own namespace string (convention: plugin manifest `id`).
 *
 * Synchronous write-through; in-memory cache to avoid repeated disk reads.
 * No size enforcement — plugins are trusted (same Claude-Code trust model).
 */
export class PluginStorageModule implements Module {
  private dir = ''
  private cache = new Map<string, Bag>()

  bootstrap(): void {
    this.dir = join(app.getPath('userData'), 'plugin-storage')
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true })
  }

  private fileOf(ns: string): string {
    const safe = ns.replace(/[^a-zA-Z0-9_-]/g, '_')
    return join(this.dir, `${safe}.json`)
  }

  private load(ns: string): Bag {
    const cached = this.cache.get(ns)
    if (cached) return cached
    const f = this.fileOf(ns)
    let bag: Bag = {}
    if (existsSync(f)) {
      try {
        bag = JSON.parse(readFileSync(f, 'utf-8'))
      } catch (e) {
        console.warn(`[plugin-storage] failed to read ${ns}:`, e)
      }
    }
    this.cache.set(ns, bag)
    return bag
  }

  private save(ns: string, bag: Bag): void {
    writeFileSync(this.fileOf(ns), JSON.stringify(bag, null, 2))
  }

  get(ns: string, key: string): unknown {
    return this.load(ns)[key]
  }

  set(ns: string, key: string, value: unknown): void {
    const bag = this.load(ns)
    bag[key] = value
    this.save(ns, bag)
  }

  remove(ns: string, key: string): void {
    const bag = this.load(ns)
    delete bag[key]
    this.save(ns, bag)
  }

  keys(ns: string): string[] {
    return Object.keys(this.load(ns))
  }
}
