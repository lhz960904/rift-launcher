import { shell } from 'electron'
import type { Module, ModuleRegistry } from '../core/ModuleRegistry'
import { installRpcRouter, registerRpc } from '../core/Rpc'
import type { SettingsModule } from './SettingsModule'
import type { AppsModule } from './AppsModule'
import type { WindowModule } from './WindowModule'
import type { HotkeyModule } from './HotkeyModule'
import type { UpdaterModule } from './UpdaterModule'
import type { SettingsShape } from '../store'

/**
 * IpcModule — single registration point for all RPC methods. Each handler
 * is a thin shim over a domain module method; no business logic lives here.
 */
export class IpcModule implements Module {
  constructor(private reg: ModuleRegistry) {}

  bootstrap(): void {
    const settings = this.reg.get<SettingsModule>('settings')
    const apps = this.reg.get<AppsModule>('apps')
    const window = this.reg.get<WindowModule>('window')
    const hotkey = this.reg.get<HotkeyModule>('hotkey')
    const updater = this.reg.get<UpdaterModule>('updater')

    installRpcRouter()

    registerRpc('settings.get', () => settings.store())
    registerRpc('settings.set', (patch: Partial<SettingsShape>) => {
      settings.applyPatch(patch)
      if ('hotkey' in patch && typeof patch.hotkey === 'string') {
        return hotkey.register(patch.hotkey)
      }
      return { ok: true }
    })

    registerRpc('apps.list', () => apps.list())
    registerRpc('apps.rebuild', () => apps.rebuild())
    registerRpc('apps.open', (path: string) => {
      shell.openPath(path)
      apps.trackOpen(path)
      window.hide({ yieldFocus: true })
    })

    registerRpc('launcher.hide', () => window.hide({ yieldFocus: true }))
    registerRpc('update.install', () => updater.installNow())
  }
}
