import type { ItemAction, SearchItem } from '../../../shared/plugin-types'
import type { AppEntry } from './api'
import type { Plugin, ResolvedCommand } from './plugins'

export type LauncherResult = {
  id: string
  title: string
  subtitle?: string
  iconSrc?: string
  iconFallback: string
  /** Right-side label shown per row: "Application" / "Command" / "Quicklink" / etc. */
  category: string
  keywords: string[]
  mruWeight: number
  /** Set when triggering this result requires user-provided argument(s). */
  argumentSlot?: string
  primaryAction: {
    label: string
    run: () => void
  }
  context?: {
    iconSrc?: string
    iconFallback: string
    name: string
  }
}

export function appToResult(
  app: AppEntry,
  onOpen: (path: string) => void
): LauncherResult {
  return {
    id: `app:${app.id}`,
    title: app.name,
    iconSrc: app.icon ?? undefined,
    iconFallback: app.name.slice(0, 1),
    category: 'Application',
    keywords: app.aliases,
    mruWeight: app.mruCount,
    primaryAction: {
      label: 'Open',
      run: () => onOpen(app.path)
    }
  }
}

export function commandToResult(
  plugin: Plugin,
  command: ResolvedCommand,
  onActivate: (plugin: Plugin, command: ResolvedCommand) => void
): LauncherResult {
  const m = plugin.manifest
  const multi = m.commands.length > 1
  const title = multi ? command.title : m.name
  const subtitle = multi ? m.name : m.description
  return {
    id: `plugin:${m.id}:cmd:${command.name}`,
    title,
    subtitle,
    iconSrc: command.iconSrc,
    iconFallback: m.name.slice(0, 1),
    category: 'Command',
    keywords: [...command.keywords, m.name],
    mruWeight: 0,
    primaryAction: {
      label: command.mode === 'view' ? 'Run' : 'Trigger',
      run: () => onActivate(plugin, command)
    },
    context: {
      iconSrc: m.iconSrc,
      iconFallback: m.name.slice(0, 1),
      name: m.name
    }
  }
}

function actionLabel(action: ItemAction): string {
  switch (action.type) {
    case 'copy':
      return 'Copy'
    case 'open-url':
    case 'open-url-with-args':
      return 'Open'
    case 'open-view':
      return 'Run'
  }
}

export type ActionDisplayInfo = {
  name: string
  iconSrc?: string
  iconFallback: string
}

export function searchItemToResult(
  plugin: Plugin,
  item: SearchItem,
  index: number,
  onAction: (action: ItemAction, plugin: Plugin, display: ActionDisplayInfo) => void
): LauncherResult {
  const m = plugin.manifest
  const iconSrc = item.icon ? plugin.assets[item.icon] ?? m.iconSrc : m.iconSrc
  const iconFallback = m.name.slice(0, 1)
  const argumentSlot =
    item.action.type === 'open-url-with-args' ? item.action.placeholders[0] : undefined
  return {
    id: `plugin:${m.id}:dyn:${item.uid ?? index}`,
    title: item.title,
    subtitle: item.subtitle ?? m.name,
    iconSrc,
    iconFallback,
    category: m.category ?? m.name,
    keywords: [],
    mruWeight: 0,
    argumentSlot,
    primaryAction: {
      label: actionLabel(item.action),
      run: () =>
        onAction(item.action, plugin, { name: item.title, iconSrc, iconFallback })
    },
    context: {
      iconSrc: m.iconSrc,
      iconFallback,
      name: m.name
    }
  }
}
