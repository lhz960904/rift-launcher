import { contextBridge, ipcRenderer } from 'electron'
import {
  RPC_CHANNEL,
  RpcCallError,
  type RpcRequest,
  type RpcResponse
} from '../shared/rpc'

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

/** Unified RPC client. Build envelope, invoke single channel, unwrap result. */
async function rpc<R = unknown, P = unknown>(method: string, payload?: P): Promise<R> {
  const req: RpcRequest<P> = {
    requestId: crypto.randomUUID(),
    method,
    payload,
    timestamp: Date.now()
  }
  const res = (await ipcRenderer.invoke(RPC_CHANNEL, req)) as RpcResponse<R>
  if (!res.success) {
    throw new RpcCallError(res.error.code, res.error.message, res.error.stack)
  }
  return res.data
}

/** One-way main → renderer push subscription. Returns an unsubscribe fn. */
function subscribe<T = void>(
  channel: string,
  cb: (payload: T) => void
): () => void {
  const fn = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, fn)
  return () => ipcRenderer.off(channel, fn)
}

const api = {
  listApps: (): Promise<AppEntry[]> => rpc('apps.list'),
  rebuildAppIndex: (): Promise<{ count: number }> => rpc('apps.rebuild'),
  openApp: (path: string): Promise<void> => rpc('apps.open', path),
  hide: (): Promise<void> => rpc('launcher.hide'),
  getSettings: (): Promise<Settings> => rpc('settings.get'),
  setSettings: (patch: Partial<Settings>): Promise<SetResult> => rpc('settings.set', patch),
  installUpdate: (): Promise<void> => rpc('update.install'),

  // One-way push subscriptions (no envelope; envelope adds no value here).
  onShow: (cb: () => void) => subscribe('launcher:show', cb),
  onHide: (cb: () => void) => subscribe('launcher:hide', cb),
  onOpenSettings: (cb: () => void) => subscribe('launcher:open-settings', cb),
  onUpdateReady: (cb: (info: { version: string }) => void) =>
    subscribe<{ version: string }>('launcher:update-ready', cb)
}

contextBridge.exposeInMainWorld('rift', api)

export type RiftAPI = typeof api
