import { clipboard, shell } from 'electron'
import { spawn } from 'node:child_process'
import type { Module } from '../core/ModuleRegistry'

/**
 * PluginApiModule — host-side implementation of capabilities exposed to
 * plugins via @rift/api. Storage lives in PluginStorageModule.
 */
export class PluginApiModule implements Module {
  bootstrap(): void {
    // No lifecycle needed yet.
  }

  copyToClipboard(text: string): void {
    clipboard.writeText(text)
  }

  readClipboard(): string {
    return clipboard.readText()
  }

  openExternal(url: string, appPath?: string): Promise<void> {
    if (!appPath) return shell.openExternal(url)
    // Use macOS `open -a <app> <url>` to route through a specific browser.
    return new Promise((resolve, reject) => {
      const proc = spawn('open', ['-a', appPath, url], { detached: true })
      proc.once('error', reject)
      proc.once('close', (code) => {
        if (code === 0 || code === null) resolve()
        else reject(new Error(`open exited with code ${code}`))
      })
    })
  }
}
