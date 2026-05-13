import { app, Menu } from 'electron'
import { ModuleRegistry } from './core/ModuleRegistry'
import { SettingsModule } from './modules/SettingsModule'
import { AppsModule } from './modules/AppsModule'
import { UpdaterModule } from './modules/UpdaterModule'
import { WindowModule } from './modules/WindowModule'
import { TrayModule } from './modules/TrayModule'
import { HotkeyModule } from './modules/HotkeyModule'
import { IpcModule } from './modules/IpcModule'
import { PluginApiModule } from './modules/PluginApiModule'
import { PluginStorageModule } from './modules/PluginStorageModule'
import { ClipboardHistoryModule } from './modules/ClipboardHistoryModule'

const registry = new ModuleRegistry()

// Single-instance lock only in packaged builds — dev runs alongside prod
// for testing without stealing the global hotkey or fighting over state.
if (app.isPackaged && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    try {
      registry.get<WindowModule>('window').show()
    } catch (e) {
      console.warn('[rift] second-instance: window not ready', e)
    }
  })

  app.whenReady().then(async () => {
    if (process.platform === 'darwin') app.dock?.hide()
    Menu.setApplicationMenu(null)

    // Register order matters: tray/hotkey/ipc resolve other modules during
    // bootstrap, so their dependencies must be registered (not yet bootstrapped) first.
    registry.register('settings', new SettingsModule())
    registry.register('apps', new AppsModule())
    registry.register('pluginApi', new PluginApiModule())
    registry.register('pluginStorage', new PluginStorageModule())
    registry.register('clipboardHistory', new ClipboardHistoryModule())
    registry.register('updater', new UpdaterModule(registry))
    registry.register('window', new WindowModule(registry))
    registry.register('tray', new TrayModule(registry))
    registry.register('hotkey', new HotkeyModule(registry))
    registry.register('ipc', new IpcModule(registry))

    for (const m of registry.all()) {
      await m.bootstrap?.()
    }
  })
}

app.on('will-quit', async () => {
  for (const m of registry.allReversed()) {
    await m.shutdown?.()
  }
})

app.on('window-all-closed', () => {
  // Tray-less / dock-less app stays alive when all BrowserWindows close.
})
