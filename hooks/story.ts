/** Captions for each tool call, and the task list as a treasure tally. Pure, no engine. */

export type Todo = { content: string; status: string; activeForm?: string }

const base = (p: unknown) => (typeof p === 'string' ? p.split('/').filter(Boolean).pop() ?? p : '')
const clip = (s: string, n = 40) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
const str = (v: unknown) => (typeof v === 'string' ? v : '')

/** The detail a screen's caption carries: which file, pattern, command or host the call was about. */
export function detail(tool: string, args: Record<string, unknown>): string {
  switch (tool) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return base(args.file_path)
    case 'NotebookEdit':
      return base(args.notebook_path)
    case 'Grep':
    case 'Glob':
      return clip(str(args.pattern))
    case 'Bash':
      return clip(str(args.description) || str(args.command))
    case 'WebFetch':
      return str(args.url).replace(/^https?:\/\//, '').split('/')[0] ?? ''
    case 'WebSearch':
      return clip(str(args.query))
    case 'Agent':
      return clip(str(args.description) || 'a helper')
    default:
      return tool.startsWith('mcp__') ? tool.split('__')[1] ?? '' : ''
  }
}

export function readTodos(args: Record<string, unknown>): Todo[] {
  const list = Array.isArray(args.todos) ? (args.todos as Record<string, unknown>[]) : []
  return list.map(t => ({ content: str(t.content), status: str(t.status), activeForm: str(t.activeForm) || undefined }))
}

/** Items newly completed between two lists, matched by content. */
export function newlyDone(prev: readonly Todo[], next: readonly Todo[]): Todo[] {
  const was = new Set(prev.filter(t => t.status === 'completed').map(t => t.content))
  return next.filter(t => t.status === 'completed' && !was.has(t.content))
}

/**
 * The tally line: "◆ 2/5 · next: Running the tests", or null with no list.
 * `lying` is completed tasks whose treasure hasn't been picked up yet; they don't count until it is.
 */
export function tally(todos: readonly Todo[], lying = 0): string | null {
  if (todos.length === 0) return null
  const done = Math.max(0, todos.filter(t => t.status === 'completed').length - lying)
  const now = todos.find(t => t.status === 'in_progress')
  const label = now ? now.activeForm || now.content : undefined
  return `◆ ${done}/${todos.length}${label ? ` · next: ${clip(label, 50)}` : ''}`
}

export function ending(isError: boolean, found: number, seconds: number): string {
  if (isError) return 'lost in the jungle. The turn ended in an error'
  if (found > 0) return `${found} ${found === 1 ? 'treasure' : 'treasures'} found in ${seconds}s`
  return `through the jungle in ${seconds}s`
}
