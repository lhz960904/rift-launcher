import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { Module, ModuleRegistry } from '../core/ModuleRegistry'
import type { WindowModule } from './WindowModule'
import type { TrayModule } from './TrayModule'

export type UpdateState = 'idle' | 'checking' | 'downloading' | 'ready'

const CHECK_THROTTLE_MS = 30 * 60 * 1000

/**
 * UpdaterModule — wraps electron-updater. Consumed by:
 *  - TrayModule (menu item label & click handler)
 *  - WindowModule (push update-ready event to renderer + maybeCheck on show)
 *  - IpcModule (renderer → installNow IPC)
 *
 * Note: ad-hoc signing means quitAndInstall fails Squirrel's signature
 * verification (logged as "Update check failed: Code signature did not
 * pass validation"). Detection + download still work; install path
 * blocked until proper Apple Developer ID — see docs/SIGNING.md.
 */
export class UpdaterModule implements Module {
  private _state: UpdateState = 'idle'
  private _version: string | null = null
  private lastCheckSilent = true
  private lastCheckAt = 0

  constructor(private reg: ModuleRegistry) {}

  bootstrap(): void {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.logger = {
      info: (...a: unknown[]) => console.log('[updater]', ...a),
      warn: (...a: unknown[]) => console.warn('[updater]', ...a),
      error: (...a: unknown[]) => console.error('[updater]', ...a),
      debug: () => {}
    }

    autoUpdater.on('checking-for-update', () => {
      this._state = 'checking'
      this.refreshTray()
    })
    autoUpdater.on('update-not-available', () => {
      this._state = 'idle'
      this.refreshTray()
      if (!this.lastCheckSilent) {
        new Notification({
          title: 'Rift is up to date',
          body: `Current version: ${app.getVersion()}`
        }).show()
      }
    })
    autoUpdater.on('update-available', (info) => {
      this._state = 'downloading'
      this._version = info.version
      this.refreshTray()
    })
    autoUpdater.on('error', (err) => {
      this._state = 'idle'
      this.refreshTray()
      if (!this.lastCheckSilent) {
        new Notification({ title: 'Update check failed', body: err.message }).show()
      }
    })
    autoUpdater.on('update-downloaded', (info) => {
      this._state = 'ready'
      this._version = info.version
      this.refreshTray()
      this.reg
        .get<WindowModule>('window')
        .webContents()
        ?.send('launcher:update-ready', { version: info.version })
      new Notification({
        title: `Rift v${info.version} ready to install`,
        body: 'Restart Rift to apply the update.'
      }).show()
    })
  }

  state(): UpdateState {
    return this._state
  }

  version(): string | null {
    return this._version
  }

  /** Manual check (bypasses throttle). silent=false → result via Notification. */
  check(silent = true): void {
    if (!app.isPackaged) {
      console.log('[updater] dev mode, skipping check')
      if (!silent) {
        new Notification({
          title: 'Update check (dev mode)',
          body: 'Auto-update only runs in packaged builds.'
        }).show()
      }
      return
    }
    this.lastCheckSilent = silent
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[updater] check failed:', err.message)
    })
  }

  /** Throttled check — called from WindowModule.show() each time launcher is summoned. */
  maybeCheck(): void {
    if (this._state !== 'idle') return
    if (Date.now() - this.lastCheckAt < CHECK_THROTTLE_MS) return
    this.lastCheckAt = Date.now()
    this.check(true)
  }

  installNow(): void {
    if (this._state === 'ready') autoUpdater.quitAndInstall()
  }

  private refreshTray(): void {
    this.reg.get<TrayModule>('tray').rebuildMenu()
  }
}
