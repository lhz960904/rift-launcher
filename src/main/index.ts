import { app, BrowserWindow, globalShortcut, ipcMain, Menu, screen, shell } from 'electron'
import { join } from 'node:path'
import { getSettings, DEFAULT_HOTKEY } from './store'
import { listApps, trackOpen } from './apps'

const WIN_W = 760
const WIN_H = 520

let win: BrowserWindow | null = null
let registeredAccelerator: string | null = null
let lastShownAt = 0

function createWindow() {
  const display = screen.getPrimaryDisplay().workArea
  const x = Math.round(display.x + (display.width - WIN_W) / 2)
  const y = Math.round(display.y + display.height * 0.13)

  win = new BrowserWindow({
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
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  win.webContents.on('did-fail-load', (_e, code, desc, url) =>
    console.error('[rift] did-fail-load', code, desc, url)
  )
  win.webContents.on('console-message', (_e, level, msg, line, src) =>
    console.log('[renderer]', level, msg, '@', src + ':' + line)
  )

  win.on('blur', () => {
    if (!win) return
    if (process.env['NODE_ENV'] === 'development' && win.webContents.isDevToolsOpened()) return
    const sinceShown = Date.now() - lastShownAt
    console.log('[rift] blur — sinceShown:', sinceShown, 'visible:', win.isVisible())
    if (sinceShown < 200) return
    hideWindow()
  })

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

function showWindow() {
  if (!win) return
  const display = screen.getPrimaryDisplay().workArea
  const x = Math.round(display.x + (display.width - WIN_W) / 2)
  const y = Math.round(display.y + display.height * 0.13)
  win.setPosition(x, y)
  lastShownAt = Date.now()
  if (process.platform === 'darwin') app.focus({ steal: true })
  win.setAlwaysOnTop(true, 'floating')
  win.show()
  win.moveTop()
  win.focus()
  win.webContents.send('launcher:show')
  console.log('[rift] show — visible:', win.isVisible(), 'focused:', win.isFocused())
}

function hideWindow(opts?: { yieldFocus?: boolean }) {
  if (!win) return
  win.hide()
  if (opts?.yieldFocus && process.platform === 'darwin') app.hide()
  win.webContents.send('launcher:hide')
  console.log('[rift] hide — yieldFocus:', !!opts?.yieldFocus, 'visible after:', win.isVisible())
}

function toggleWindow() {
  if (!win) return
  const visible = win.isVisible()
  const focused = win.isFocused()
  console.log('[rift] toggle — visible:', visible, 'focused:', focused)
  if (!visible) {
    showWindow()
  } else if (!focused) {
    if (process.platform === 'darwin') app.focus({ steal: true })
    win.moveTop()
    win.focus()
  } else {
    hideWindow({ yieldFocus: true })
  }
}

function registerHotkey(accelerator: string): { ok: boolean; error?: string } {
  if (registeredAccelerator) globalShortcut.unregister(registeredAccelerator)
  try {
    const ok = globalShortcut.register(accelerator, toggleWindow)
    if (!ok) {
      registeredAccelerator = null
      return { ok: false, error: 'Shortcut could not be registered (possibly in use).' }
    }
    registeredAccelerator = accelerator
    return { ok: true }
  } catch (e) {
    registeredAccelerator = null
    return { ok: false, error: (e as Error).message }
  }
}

ipcMain.handle('settings:get', () => getSettings().store)
ipcMain.handle('settings:set', (_e, patch: Record<string, unknown>) => {
  const s = getSettings()
  for (const [k, v] of Object.entries(patch)) s.set(k as never, v as never)
  if ('hotkey' in patch && typeof patch.hotkey === 'string') {
    return registerHotkey(patch.hotkey)
  }
  return { ok: true }
})
ipcMain.handle('apps:list', () => listApps())
ipcMain.handle('apps:open', (_e, p: string) => {
  shell.openPath(p)
  trackOpen(p)
  hideWindow({ yieldFocus: true })
})
ipcMain.handle('launcher:hide', () => hideWindow({ yieldFocus: true }))

app.whenReady().then(() => {
  if (process.platform === 'darwin') app.dock?.hide()
  Menu.setApplicationMenu(null)
  createWindow()
  const hotkey = getSettings().get('hotkey') || DEFAULT_HOTKEY
  const result = registerHotkey(hotkey)
  if (!result.ok) {
    console.warn('[rift] Failed to register hotkey:', hotkey, result.error)
  } else {
    console.log('[rift] Hotkey registered:', hotkey)
  }
  if (win) {
    win.once('ready-to-show', () => showWindow())
  }
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => {
  // keep app alive in tray-less mode; don't quit when window hides
})
