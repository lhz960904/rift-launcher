import { globalShortcut } from 'electron'
import type { Module, ModuleRegistry } from '../core/ModuleRegistry'
import type { SettingsModule } from './SettingsModule'
import type { WindowModule } from './WindowModule'
import type { TrayModule } from './TrayModule'

export const DEFAULT_HOTKEY = 'Alt+Cmd+Space'

/**
 * HotkeyModule — global accelerator registration. On bootstrap reads
 * the user-configured hotkey from settings (fallback to DEFAULT_HOTKEY)
 * and registers it; trigger calls WindowModule.toggle().
 *
 * Re-registration (when user records a new hotkey) goes through
 * IpcModule → register(newAccelerator) → unregister old, register new,
 * tell tray to refresh its menu (since the menu shows the accelerator).
 */
export class HotkeyModule implements Module {
  private registered: string | null = null

  constructor(private reg: ModuleRegistry) {}

  bootstrap(): void {
    const settings = this.reg.get<SettingsModule>('settings')
    const hotkey = settings.get('hotkey') || DEFAULT_HOTKEY
    const result = this.register(hotkey)
    if (!result.ok) {
      console.warn('[rift] Failed to register hotkey:', hotkey, result.error)
    } else {
      console.log('[rift] Hotkey registered:', hotkey)
    }
  }

  register(accelerator: string): { ok: boolean; error?: string } {
    if (this.registered) globalShortcut.unregister(this.registered)
    try {
      const ok = globalShortcut.register(accelerator, () => {
        this.reg.get<WindowModule>('window').toggle()
      })
      if (!ok) {
        this.registered = null
        this.reg.get<TrayModule>('tray').rebuildMenu()
        return { ok: false, error: 'Shortcut could not be registered (possibly in use).' }
      }
      this.registered = accelerator
      this.reg.get<TrayModule>('tray').rebuildMenu()
      return { ok: true }
    } catch (e) {
      this.registered = null
      this.reg.get<TrayModule>('tray').rebuildMenu()
      return { ok: false, error: (e as Error).message }
    }
  }

  current(): string | null {
    return this.registered
  }

  shutdown(): void {
    globalShortcut.unregisterAll()
  }
}
