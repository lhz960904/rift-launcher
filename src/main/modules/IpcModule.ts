import { shell } from 'electron'
import type { Module, ModuleRegistry } from '../core/ModuleRegistry'
import { installRpcRouter, registerRpc } from '../core/Rpc'
import type { SettingsModule } from './SettingsModule'
import type { AppsModule } from './AppsModule'
import type { WindowModule } from './WindowModule'
import type { HotkeyModule } from './HotkeyModule'
import type { UpdaterModule } from './UpdaterModule'
import type { PluginApiModule } from './PluginApiModule'
import type { PluginStorageModule } from './PluginStorageModule'
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
    const pluginApi = this.reg.get<PluginApiModule>('pluginApi')
    const pluginStorage = this.reg.get<PluginStorageModule>('pluginStorage')

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
    registerRpc('launcher.toggleDevTools', () => window.toggleDevTools())
    registerRpc('update.install', () => updater.installNow())

    registerRpc('pluginApi.clipboard.copy', (payload: { text: string }) => {
      pluginApi.copyToClipboard(payload.text)
    })
    registerRpc('pluginApi.clipboard.read', () => pluginApi.readClipboard())

    registerRpc(
      'pluginApi.shell.openExternal',
      (payload: { url: string; appPath?: string }) =>
        pluginApi.openExternal(payload.url, payload.appPath)
    )

    registerRpc('pluginApi.storage.get', (payload: { namespace: string; key: string }) =>
      pluginStorage.get(payload.namespace, payload.key)
    )
    registerRpc(
      'pluginApi.storage.set',
      (payload: { namespace: string; key: string; value: unknown }) =>
        pluginStorage.set(payload.namespace, payload.key, payload.value)
    )
    registerRpc('pluginApi.storage.remove', (payload: { namespace: string; key: string }) =>
      pluginStorage.remove(payload.namespace, payload.key)
    )
    registerRpc('pluginApi.storage.keys', (payload: { namespace: string }) =>
      pluginStorage.keys(payload.namespace)
    )
  }
}
