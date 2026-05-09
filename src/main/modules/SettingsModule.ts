import { app } from 'electron'
import type { Module } from '../core/ModuleRegistry'
import { getSettings, type SettingsShape } from '../store'

/**
 * SettingsModule — wraps the JsonStore and surfaces a typed API.
 * On bootstrap, syncs `launchAtLogin` from system state (system is source
 * of truth — user might have toggled it in System Settings while we were off).
 */
export class SettingsModule implements Module {
  bootstrap(): void {
    const sysLogin = app.getLoginItemSettings().openAtLogin
    if (this.get('launchAtLogin') !== sysLogin) {
      this.set('launchAtLogin', sysLogin)
    }
  }

  store(): SettingsShape {
    return getSettings().store
  }

  get<K extends keyof SettingsShape>(key: K): SettingsShape[K] {
    return getSettings().get(key)
  }

  set<K extends keyof SettingsShape>(key: K, value: SettingsShape[K]): void {
    getSettings().set(key, value)
  }

  /** Apply a Partial<SettingsShape> patch + side-effects (login item sync). */
  applyPatch(patch: Partial<SettingsShape>): void {
    for (const [k, v] of Object.entries(patch)) {
      this.set(k as keyof SettingsShape, v as never)
    }
    if ('launchAtLogin' in patch && typeof patch.launchAtLogin === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: patch.launchAtLogin })
    }
  }
}
