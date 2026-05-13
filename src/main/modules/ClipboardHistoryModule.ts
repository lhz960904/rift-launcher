import { app, clipboard } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Module } from '../core/ModuleRegistry'

const POLL_INTERVAL_MS = 500
const MAX_ENTRIES = 200
const WRITE_DEBOUNCE_MS = 1000
const SCHEMA_VERSION = 1

export type ClipEntry = {
  text: string
  ts: number
}

type Persisted = {
  version: number
  entries: ClipEntry[]
}

/**
 * ClipboardHistoryModule — polls the system clipboard so the launcher can
 * surface past copies. macOS provides no NSPasteboard change notification,
 * so polling is the only option (this is what Maccy / Clipy / Raycast etc.
 * all do under the hood).
 *
 * Costs ~negligible CPU; 500ms tick reads a small string and string-compares.
 *
 * Dedup semantics: copying the same text again moves the existing entry to
 * the front instead of duplicating. Capped at MAX_ENTRIES (oldest evicted).
 */
export class ClipboardHistoryModule implements Module {
  private entries: ClipEntry[] = []
  private lastSeen = ''
  private timer: NodeJS.Timeout | null = null
  private writeTimer: NodeJS.Timeout | null = null
  private filePath = ''

  bootstrap(): void {
    this.filePath = join(app.getPath('userData'), 'clipboard-history.json')
    this.loadFromDisk()
    this.lastSeen = clipboard.readText() ?? ''
    this.timer = setInterval(() => this.tick(), POLL_INTERVAL_MS)
    console.log(
      `[clipboard-history] bootstrapped, ${this.entries.length} entries loaded`
    )
  }

  async shutdown(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (this.writeTimer) {
      clearTimeout(this.writeTimer)
      this.flushToDisk()
    }
  }

  private loadFromDisk(): void {
    if (!existsSync(this.filePath)) return
    try {
      const data = JSON.parse(readFileSync(this.filePath, 'utf-8')) as Persisted
      if (data.version === SCHEMA_VERSION && Array.isArray(data.entries)) {
        this.entries = data.entries.slice(0, MAX_ENTRIES)
      }
    } catch (e) {
      console.warn('[clipboard-history] load failed:', (e as Error).message)
    }
  }

  private scheduleWrite(): void {
    if (this.writeTimer) clearTimeout(this.writeTimer)
    this.writeTimer = setTimeout(() => this.flushToDisk(), WRITE_DEBOUNCE_MS)
  }

  private flushToDisk(): void {
    try {
      const data: Persisted = { version: SCHEMA_VERSION, entries: this.entries }
      writeFileSync(this.filePath, JSON.stringify(data))
    } catch (e) {
      console.error('[clipboard-history] write failed:', (e as Error).message)
    }
    this.writeTimer = null
  }

  private tick(): void {
    const text = clipboard.readText()
    if (!text || text === this.lastSeen) return
    this.lastSeen = text
    this.capture(text)
  }

  private capture(text: string): void {
    // Move-to-front dedupe
    const idx = this.entries.findIndex((e) => e.text === text)
    if (idx >= 0) this.entries.splice(idx, 1)
    this.entries.unshift({ text, ts: Date.now() })
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES
    }
    this.scheduleWrite()
  }

  list(limit?: number): ClipEntry[] {
    return typeof limit === 'number' ? this.entries.slice(0, limit) : this.entries
  }

  clear(): void {
    this.entries = []
    this.scheduleWrite()
  }

  remove(ts: number): void {
    this.entries = this.entries.filter((e) => e.ts !== ts)
    this.scheduleWrite()
  }
}
