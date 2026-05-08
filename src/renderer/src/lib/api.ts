import type { RiftAPI } from '../../../preload/index'

declare global {
  interface Window {
    rift: RiftAPI
  }
}

export const rift = window.rift
export type { AppEntry, Settings } from '../../../preload/index'
