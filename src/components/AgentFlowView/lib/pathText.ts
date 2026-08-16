/**
 * Path-aware text compaction for step summaries.
 *
 * Plain tail truncation keeps the useless prefix of a path ("/Users/foo/.claude/projects/…")
 * and drops the file name, which is the part worth reading. These helpers shrink the
 * directory part instead, so the file name survives.
 */

const PATH_PATTERN = /[~\w.@%+-]*(?:\/[\w.@%+-]+){2,}/g

export function shortenPath(path: string, max = 40): string {
  if (path.length <= max) return path

  const segments = path.split('/').filter(Boolean)
  const file = segments[segments.length - 1] ?? path
  const parent = segments[segments.length - 2]

  if (parent && `…/${parent}/${file}`.length <= max) return `…/${parent}/${file}`
  if (`…/${file}`.length <= max) return `…/${file}`
  return `…${file.slice(-(max - 1))}`
}

export function compactPaths(value: string, max = 40): string {
  return value.replace(PATH_PATTERN, (match: string, offset: number, full: string) => {
    const previousChar = full.slice(Math.max(0, offset - 1), offset)
    // Leave URLs ("https://host/a/b") and already-shortened paths alone.
    if (previousChar === '/' || previousChar === ':') return match
    return shortenPath(match, max)
  })
}
