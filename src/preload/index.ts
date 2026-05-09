import { contextBridge, ipcRenderer } from 'electron'

export type AppEntry = {
  id: string
  name: string
  path: string
  icon: string | null
  aliases: string[]
  mruCount: number
  mruLastUsed: number
}

export type Settings = { hotkey: string; theme: 'dark' | 'light'; launchAtLogin: boolean }
export type SetResult = { ok: boolean; error?: string }

const api = {
  listApps: (): Promise<AppEntry[]> => ipcRenderer.invoke('apps:list'),
  rebuildAppIndex: (): Promise<{ count: number }> => ipcRenderer.invoke('apps:rebuild'),
  openApp: (path: string): Promise<void> => ipcRenderer.invoke('apps:open', path),
  hide: (): Promise<void> => ipcRenderer.invoke('launcher:hide'),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
  setSettings: (patch: Partial<Settings>): Promise<SetResult> =>
    ipcRenderer.invoke('settings:set', patch),
  onShow: (cb: () => void): (() => void) => {
    const fn = () => cb()
    ipcRenderer.on('launcher:show', fn)
    return () => ipcRenderer.off('launcher:show', fn)
  },
  onHide: (cb: () => void): (() => void) => {
    const fn = () => cb()
    ipcRenderer.on('launcher:hide', fn)
    return () => ipcRenderer.off('launcher:hide', fn)
  },
  onOpenSettings: (cb: () => void): (() => void) => {
    const fn = () => cb()
    ipcRenderer.on('launcher:open-settings', fn)
    return () => ipcRenderer.off('launcher:open-settings', fn)
  },
  onUpdateReady: (cb: (info: { version: string }) => void): (() => void) => {
    const fn = (_e: unknown, info: { version: string }) => cb(info)
    ipcRenderer.on('launcher:update-ready', fn)
    return () => ipcRenderer.off('launcher:update-ready', fn)
  },
  installUpdate: (): Promise<void> => ipcRenderer.invoke('update:install')
}

contextBridge.exposeInMainWorld('rift', api)

export type RiftAPI = typeof api
