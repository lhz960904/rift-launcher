import { app, BrowserWindow, screen, shell } from 'electron'
import { join } from 'node:path'
import type { Module, ModuleRegistry } from '../core/ModuleRegistry'
import type { UpdaterModule } from './UpdaterModule'
import type { SettingsModule } from './SettingsModule'
import type { WindowPosition } from '../store'

const WIN_W = 760
const WIN_H = 520
const Y_RATIO = 0.20
const MOVE_PERSIST_DEBOUNCE_MS = 400

/**
 * WindowModule — single frameless transparent BrowserWindow + show/hide/
 * toggle 三态 + blur auto-hide. On show(), pings UpdaterModule for a
 * throttled check and re-pushes update-ready state in case renderer
 * just (re)mounted.
 */
export class WindowModule implements Module {
  private win: BrowserWindow | null = null
  private lastShownAt = 0
  private moveTimer: NodeJS.Timeout | null = null
  /** Suppress 'move' persistence during programmatic setPosition (show, recenter). */
  private suppressMoveUntil = 0

  constructor(private reg: ModuleRegistry) {}

  bootstrap(): void {
    this.create()
    this.win?.once('ready-to-show', () => this.show())
  }

  private alive(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  private ensure(): BrowserWindow {
    if (!this.alive()) {
      console.warn('[rift] window was destroyed — recreating')
      this.create()
    }
    return this.win!
  }

  /** Returns the display the cursor currently lives on (Raycast-style multi-monitor). */
  private activeDisplay(): Electron.Display {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  }

  private defaultPosition(area: Electron.Rectangle): WindowPosition {
    return {
      x: Math.round(area.x + (area.width - WIN_W) / 2),
      y: Math.round(area.y + area.height * Y_RATIO)
    }
  }

  /** Returns remembered position for current display if it still fits, otherwise default. */
  private positionForActiveDisplay(): WindowPosition {
    const display = this.activeDisplay()
    const settings = this.reg.get<SettingsModule>('settings')
    const remembered = settings.get('windowPositions')[String(display.id)]
    if (remembered && this.fitsWithin(remembered, display.workArea)) return remembered
    return this.defaultPosition(display.workArea)
  }

  private fitsWithin(p: WindowPosition, area: Electron.Rectangle): boolean {
    return (
      p.x >= area.x &&
      p.y >= area.y &&
      p.x + WIN_W <= area.x + area.width &&
      p.y + WIN_H <= area.y + area.height
    )
  }

  private persistCurrentPosition(): void {
    if (!this.alive()) return
    const win = this.win!
    const [x, y] = win.getPosition()
    const display = screen.getDisplayNearestPoint({ x: x + WIN_W / 2, y: y + WIN_H / 2 })
    const settings = this.reg.get<SettingsModule>('settings')
    const next = { ...settings.get('windowPositions'), [String(display.id)]: { x, y } }
    settings.set('windowPositions', next)
    console.log('[rift] persisted window pos', { display: display.id, x, y })
  }

  private create(): void {
    const { x, y } = this.positionForActiveDisplay()

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

    this.win.on('move', () => {
      if (Date.now() < this.suppressMoveUntil) return
      if (this.moveTimer) clearTimeout(this.moveTimer)
      this.moveTimer = setTimeout(() => this.persistCurrentPosition(), MOVE_PERSIST_DEBOUNCE_MS)
    })

    this.win.on('blur', () => {
      if (!this.alive()) return
      if (
        process.env['NODE_ENV'] === 'development' &&
        this.win!.webContents.isDevToolsOpened()
      )
        return
      const sinceShown = Date.now() - this.lastShownAt
      console.log('[rift] blur — sinceShown:', sinceShown, 'visible:', this.win!.isVisible())
      if (sinceShown < 200) return
      this.hide()
    })

    this.win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })
  }

  show(): void {
    const win = this.ensure()
    const { x, y } = this.positionForActiveDisplay()
    this.suppressMoveUntil = Date.now() + 200
    win.setPosition(x, y)
    this.lastShownAt = Date.now()
    if (process.platform === 'darwin') app.focus({ steal: true })
    win.setAlwaysOnTop(true, 'floating')
    win.show()
    win.moveTop()
    win.focus()
    win.webContents.send('launcher:show')

    const updater = this.reg.get<UpdaterModule>('updater')
    if (updater.state() === 'ready' && updater.version()) {
      win.webContents.send('launcher:update-ready', { version: updater.version() })
    }
    updater.maybeCheck()

    console.log('[rift] show — visible:', win.isVisible(), 'focused:', win.isFocused())
  }

  hide(opts?: { yieldFocus?: boolean }): void {
    if (!this.alive()) return
    const win = this.win!
    win.hide()
    if (opts?.yieldFocus && process.platform === 'darwin') app.hide()
    win.webContents.send('launcher:hide')
    console.log(
      '[rift] hide — yieldFocus:',
      !!opts?.yieldFocus,
      'visible after:',
      win.isVisible()
    )
  }

  toggle(): void {
    const win = this.ensure()
    const visible = win.isVisible()
    const focused = win.isFocused()
    console.log('[rift] toggle — visible:', visible, 'focused:', focused)
    if (!visible) {
      this.show()
    } else if (!focused) {
      if (process.platform === 'darwin') app.focus({ steal: true })
      win.moveTop()
      win.focus()
    } else {
      this.hide({ yieldFocus: true })
    }
  }

  openSettings(): void {
    this.show()
    if (this.alive()) this.win!.webContents.send('launcher:open-settings')
  }

  webContents(): Electron.WebContents | undefined {
    return this.alive() ? this.win!.webContents : undefined
  }
}
