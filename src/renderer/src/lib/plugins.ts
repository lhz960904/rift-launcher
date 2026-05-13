import type { ComponentType } from 'react'
import type { SearchFn } from '../../../shared/plugin-types'

type RawCommand = {
  name: string
  title?: string
  description?: string
  mode?: 'view' | 'no-view'
  keywords?: string[]
  icon?: string
}

type RawManifest = {
  id: string
  name: string
  icon: string
  description?: string
  /** Display label for this plugin's dynamic search items (e.g. "Quicklink"). Static manifest commands always show "Command". */
  category?: string
  commands: RawCommand[]
}

export type ResolvedCommand = {
  name: string
  title: string
  description?: string
  mode: 'view' | 'no-view'
  keywords: string[]
  iconSrc: string
}

export type PluginManifest = {
  id: string
  name: string
  description?: string
  category?: string
  iconSrc: string
  commands: ResolvedCommand[]
}

export type PluginViewProps = {
  commandName: string
  onClose: () => void
}

export type Plugin = {
  manifest: PluginManifest
  View?: ComponentType<PluginViewProps>
  search?: SearchFn
  /** Plugin-relative filename → resolved asset URL. Used by SearchItem.icon. */
  assets: Record<string, string>
}

const manifestModules = import.meta.glob<RawManifest>('../plugins/*/plugin.json', {
  eager: true,
  import: 'default'
})

const assetModules = import.meta.glob<string>(
  '../plugins/*/*.{svg,png,jpg,jpeg,webp}',
  { eager: true, query: '?url', import: 'default' }
)

const viewModules = import.meta.glob<{ default: ComponentType<PluginViewProps> }>(
  '../plugins/*/index.tsx',
  { eager: true }
)

const searchModules = import.meta.glob<{ default: SearchFn }>(
  '../plugins/*/search.ts',
  { eager: true }
)

function dirOf(path: string): string {
  const m = /\/plugins\/([^/]+)\//.exec(path)
  return m?.[1] ?? ''
}

function basenameOf(path: string): string {
  const m = /\/([^/]+)$/.exec(path)
  return m?.[1] ?? path
}

function buildAssetMap(pluginDir: string): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [p, url] of Object.entries(assetModules)) {
    if (dirOf(p) === pluginDir) map[basenameOf(p)] = url
  }
  return map
}

function findModule<T>(modules: Record<string, T>, pluginDir: string): T | undefined {
  const key = Object.keys(modules).find((p) => dirOf(p) === pluginDir)
  return key ? modules[key] : undefined
}

export const plugins: Plugin[] = Object.entries(manifestModules)
  .map(([path, raw]): Plugin | null => {
    const dir = dirOf(path)
    const assets = buildAssetMap(dir)
    const iconSrc = assets[raw.icon]
    if (!iconSrc) {
      console.warn(`[plugins] missing icon ${raw.icon} for ${dir}`)
      return null
    }
    const commands: ResolvedCommand[] = raw.commands.map((c) => ({
      name: c.name,
      title: c.title || c.name,
      description: c.description,
      mode: c.mode ?? 'view',
      keywords: c.keywords ?? [],
      iconSrc: (c.icon && assets[c.icon]) || iconSrc
    }))
    const view = findModule(viewModules, dir)?.default
    const search = findModule(searchModules, dir)?.default
    return {
      manifest: {
        id: raw.id,
        name: raw.name,
        description: raw.description,
        category: raw.category,
        iconSrc,
        commands
      },
      View: view,
      search,
      assets
    }
  })
  .filter((p): p is Plugin => p !== null)
