import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { Module, ModuleRegistry } from '../core/ModuleRegistry'
import type { UpdaterModule } from './UpdaterModule'

const WIN_W = 760
const WIN_H = 520

/**
 * WindowModule — single frameless transparent BrowserWindow + show/hide/
 * toggle 三态 + blur auto-hide. On show(), pings UpdaterModule for a
 * throttled check and re-pushes update-ready state in case renderer
 * just (re)mounted.
 */
export class WindowModule implements Module {
  private win: BrowserWindow | null = null
  private lastShownAt = 0

  constructor(private reg: ModuleRegistry) {}

  bootstrap(): void {
    this.create()
    this.win?.once('ready-to-show', () => this.show())
  }

  private create(): void {
    const display = screen.getPrimaryDisplay().workArea
    const x = Math.round(display.x + (display.width - WIN_W) / 2)
    const y = Math.round(display.y + display.height * 0.13)

    this.win = new BrowserWindow({
      width: WIN_W,
      height: WIN_H,
      x,
      y,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: true,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      hasShadow: true,
      roundedCorners: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    })
    this.win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    if (process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
      this.win.loadFile(join(__dirname, '../renderer/index.html'))
    }
    this.win.webContents.on('did-fail-load', (_e, code, desc, url) =>
      console.error('[rift] did-fail-load', code, desc, url)
    )
    this.win.webContents.on('console-message', (_e, level, msg, line, src) =>
      console.log('[renderer]', level, msg, '@', src + ':' + line)
    )

    this.win.on('blur', () => {
      if (!this.win) return
      if (
        process.env['NODE_ENV'] === 'development' &&
        this.win.webContents.isDevToolsOpened()
      )
        return
      const sinceShown = Date.now() - this.lastShownAt
      console.log('[rift] blur — sinceShown:', sinceShown, 'visible:', this.win.isVisible())
      if (sinceShown < 200) return
      this.hide()
    })

    this.win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })
  }

  show(): void {
    if (!this.win) return
    const display = screen.getPrimaryDisplay().workArea
    const x = Math.round(display.x + (display.width - WIN_W) / 2)
    const y = Math.round(display.y + display.height * 0.13)
    this.win.setPosition(x, y)
    this.lastShownAt = Date.now()
    if (process.platform === 'darwin') app.focus({ steal: true })
    this.win.setAlwaysOnTop(true, 'floating')
    this.win.show()
    this.win.moveTop()
    this.win.focus()
    this.win.webContents.send('launcher:show')

    const updater = this.reg.get<UpdaterModule>('updater')
    if (updater.state() === 'ready' && updater.version()) {
      this.win.webContents.send('launcher:update-ready', { version: updater.version() })
    }
    updater.maybeCheck()

    console.log('[rift] show — visible:', this.win.isVisible(), 'focused:', this.win.isFocused())
  }

  hide(opts?: { yieldFocus?: boolean }): void {
    if (!this.win) return
    this.win.hide()
    if (opts?.yieldFocus && process.platform === 'darwin') app.hide()
    this.win.webContents.send('launcher:hide')
    console.log(
      '[rift] hide — yieldFocus:',
      !!opts?.yieldFocus,
      'visible after:',
      this.win.isVisible()
    )
  }

  toggle(): void {
    if (!this.win) return
    const visible = this.win.isVisible()
    const focused = this.win.isFocused()
    console.log('[rift] toggle — visible:', visible, 'focused:', focused)
    if (!visible) {
      this.show()
    } else if (!focused) {
      if (process.platform === 'darwin') app.focus({ steal: true })
      this.win.moveTop()
      this.win.focus()
    } else {
      this.hide({ yieldFocus: true })
    }
  }

  openSettings(): void {
    this.show()
    this.win?.webContents.send('launcher:open-settings')
  }

  webContents(): Electron.WebContents | undefined {
    return this.win?.webContents
  }
}
