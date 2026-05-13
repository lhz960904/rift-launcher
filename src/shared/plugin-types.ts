/**
 * Shared plugin contract types — used by main (RPC layer), renderer
 * (Launcher + plugin loader), and plugin authors themselves (via @rift/api).
 *
 * SearchItem shape is a trimmed Alfred Script Filter dialect: plugin search.ts
 * returns these to push results into the main launcher list.
 */

export type ItemAction =
  | { type: 'copy'; text: string }
  | { type: 'open-url'; url: string; appPath?: string }
  | {
      type: 'open-url-with-args'
      urlTemplate: string
      /** Placeholder names the user must fill (e.g. ['argument']). {clipboard} is auto-substituted, not listed here. */
      placeholders: string[]
      appPath?: string
    }
  | { type: 'open-view'; commandName?: string; query?: string }

export type SearchItem = {
  /** Stable id for MRU learning. Omit to opt out. */
  uid?: string
  title: string
  subtitle?: string
  /** Plugin-relative filename (resolved by loader) or absolute data/http URL. */
  icon?: string
  /** What happens when the user presses Enter. */
  action: ItemAction
}

export type SearchInput = {
  query: string
}

export type SearchFn = (input: SearchInput) => SearchItem[] | Promise<SearchItem[]>
