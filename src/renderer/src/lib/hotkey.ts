const MOD_CODES = new Set([
  'MetaLeft', 'MetaRight',
  'ControlLeft', 'ControlRight',
  'AltLeft', 'AltRight',
  'ShiftLeft', 'ShiftRight'
])

function codeToKey(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3)
  if (code.startsWith('Digit')) return code.slice(5)
  if (code.startsWith('Numpad')) {
    const rest = code.slice(6)
    if (/^\d$/.test(rest)) return 'num' + rest
    return null
  }
  if (/^F\d+$/.test(code)) return code
  if (code.startsWith('Arrow')) return code.slice(5)
  switch (code) {
    case 'Space': return 'Space'
    case 'Enter': return 'Return'
    case 'Tab': return 'Tab'
    case 'Escape': return 'Esc'
    case 'Backspace': return 'Backspace'
    case 'Delete': return 'Delete'
    case 'Home': return 'Home'
    case 'End': return 'End'
    case 'PageUp': return 'PageUp'
    case 'PageDown': return 'PageDown'
    case 'Backquote': return '`'
    case 'Minus': return '-'
    case 'Equal': return '='
    case 'BracketLeft': return '['
    case 'BracketRight': return ']'
    case 'Backslash': return '\\'
    case 'Semicolon': return ';'
    case 'Quote': return "'"
    case 'Comma': return ','
    case 'Period': return '.'
    case 'Slash': return '/'
    default: return null
  }
}

export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (MOD_CODES.has(e.code)) return null
  const key = codeToKey(e.code)
  if (!key) return null

  const parts: string[] = []
  if (e.metaKey) parts.push('Cmd')
  if (e.ctrlKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (parts.length === 0) return null

  parts.push(key)
  return parts.join('+')
}

const SYMBOL: Record<string, string> = {
  Cmd: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
  Space: 'Space',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
  Enter: '↵',
  Return: '↵',
  Esc: 'Esc',
  Tab: '⇥',
  Backspace: '⌫'
}

export function formatAccelerator(acc: string): string {
  return acc
    .split('+')
    .map((p) => SYMBOL[p] ?? p)
    .join(' ')
}
