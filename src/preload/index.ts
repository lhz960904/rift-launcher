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

export type Settings = { hotkey: string; theme: 'dark' | 'light' }
export type SetResult = { ok: boolean; error?: string }

const api = {
  listApps: (): Promise<AppEntry[]> => ipcRenderer.invoke('apps:list'),
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
  }
}

contextBridge.exposeInMainWorld('rift', api)

export type RiftAPI = typeof api
