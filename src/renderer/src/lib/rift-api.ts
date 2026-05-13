/**
 * @rift/api — public surface plugins import. Re-exports shared types and
 * exposes thin renderer-side shims over the RPC envelope. Plugin code never
 * touches window.rift directly; this is the only contract.
 */

import { rift } from './api'

export const Clipboard = {
  copy: (text: string): Promise<void> => rift.pluginApi.clipboardCopy(text),
  read: (): Promise<string> => rift.pluginApi.clipboardRead()
}

export type OpenExternalOptions = {
  /** Absolute .app path. If omitted, opens with the system default handler. */
  appPath?: string
}

export const Shell = {
  openExternal: (url: string, opts?: OpenExternalOptions): Promise<void> =>
    rift.pluginApi.shellOpenExternal(url, opts?.appPath)
}

export const Apps = {
  list: () => rift.listApps()
}

/**
 * Namespaced per-plugin JSON storage. Convention: namespace = plugin manifest `id`.
 * Values must be JSON-serializable (passes through RPC envelope).
 */
export const Storage = {
  scope(namespace: string) {
    return {
      get: <T = unknown>(key: string): Promise<T | undefined> =>
        rift.pluginApi.storageGet(namespace, key) as Promise<T | undefined>,
      set: <T = unknown>(key: string, value: T): Promise<void> =>
        rift.pluginApi.storageSet(namespace, key, value as unknown),
      remove: (key: string): Promise<void> =>
        rift.pluginApi.storageRemove(namespace, key),
      keys: (): Promise<string[]> => rift.pluginApi.storageKeys(namespace)
    }
  }
}

export type { AppEntry } from './api'

export type {
  SearchItem,
  SearchInput,
  SearchFn,
  ItemAction
} from '../../../shared/plugin-types'
