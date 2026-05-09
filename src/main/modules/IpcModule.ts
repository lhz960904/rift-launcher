import { ipcMain, shell } from 'electron'
import type { Module, ModuleRegistry } from '../core/ModuleRegistry'
import type { SettingsModule } from './SettingsModule'
import type { AppsModule } from './AppsModule'
import type { WindowModule } from './WindowModule'
import type { HotkeyModule } from './HotkeyModule'
import type { UpdaterModule } from './UpdaterModule'
import type { SettingsShape } from '../store'

/**
 * IpcModule — single registration point for all `ipcMain.handle` calls.
 * Each handler is a thin shim over a domain module method; no business
 * logic lives here.
 */
export class IpcModule implements Module {
  constructor(private reg: ModuleRegistry) {}

  bootstrap(): void {
    const settings = this.reg.get<SettingsModule>('settings')
    const apps = this.reg.get<AppsModule>('apps')
    const window = this.reg.get<WindowModule>('window')
    const hotkey = this.reg.get<HotkeyModule>('hotkey')
    const updater = this.reg.get<UpdaterModule>('updater')

    ipcMain.handle('settings:get', () => settings.store())
    ipcMain.handle('settings:set', (_e, patch: Partial<SettingsShape>) => {
      settings.applyPatch(patch)
      if ('hotkey' in patch && typeof patch.hotkey === 'string') {
        return hotkey.register(patch.hotkey)
      }
      return { ok: true }
    })
    ipcMain.handle('apps:list', () => apps.list())
    ipcMain.handle('apps:rebuild', () => apps.rebuild())
    ipcMain.handle('apps:open', (_e, p: string) => {
      shell.openPath(p)
      apps.trackOpen(p)
      window.hide({ yieldFocus: true })
    })
    ipcMain.handle('launcher:hide', () => window.hide({ yieldFocus: true }))
    ipcMain.handle('update:install', () => updater.installNow())
  }
}
