import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'

export const DEFAULT_HOTKEY = 'Alt+Cmd+Space'

export type MruEntry = { count: number; lastUsed: number }

export type SettingsShape = {
  hotkey: string
  theme: 'dark' | 'light'
  mru: Record<string, MruEntry>
  appAliases: Record<string, string[]>
}

const DEFAULTS: SettingsShape = {
  hotkey: DEFAULT_HOTKEY,
  theme: 'dark',
  mru: {},
  appAliases: {}
}

class JsonStore<T extends Record<string, unknown>> {
  private path: string
  private data: T

  constructor(filename: string, defaults: T) {
    this.path = join(app.getPath('userData'), filename)
    let parsed: Partial<T> = {}
    if (existsSync(this.path)) {
      try {
        parsed = JSON.parse(readFileSync(this.path, 'utf8')) as Partial<T>
      } catch {
        parsed = {}
      }
    }
    this.data = { ...defaults, ...parsed }
    this.persist()
  }

  get store(): T {
    return { ...this.data }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    this.persist()
  }

  private persist() {
    if (!existsSync(dirname(this.path))) mkdirSync(dirname(this.path), { recursive: true })
    writeFileSync(this.path, JSON.stringify(this.data, null, 2))
  }
}

let _settings: JsonStore<SettingsShape> | null = null
export function getSettings(): JsonStore<SettingsShape> {
  if (!_settings) _settings = new JsonStore('settings.json', DEFAULTS)
  return _settings
}
