import YAML from 'yaml'

export interface FrontMatter {
  data: Record<string, unknown>
  body: string
}

const FM_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/

export function parseFrontMatter(content: string): FrontMatter {
  const match = content.match(FM_PATTERN)
  if (!match) return { data: {}, body: content }
  try {
    const data = YAML.parse(match[1]) ?? {}
    return { data: typeof data === 'object' ? data : {}, body: content.slice(match[0].length) }
  } catch {
    return { data: {}, body: content }
  }
}

export function stringifyFrontMatter(data: Record<string, unknown>, body: string): string {
  if (!data || Object.keys(data).length === 0) return body
  const yaml = YAML.stringify(data).trim()
  return `---\n${yaml}\n---\n\n${body.replace(/^\n+/, '')}`
}

export function extractTitle(content: string, fallback = 'Untitled'): string {
  const { data, body } = parseFrontMatter(content)
  if (typeof data.title === 'string' && data.title.trim()) return data.title.trim()
  const h1 = body.match(/^\s*#\s+(.+)$/m)
  if (h1) return h1[1].trim()
  const firstLine = body.split('\n').find(l => l.trim())
  return firstLine?.trim().slice(0, 80) || fallback
}

export function extractExcerpt(content: string, length = 200): string {
  const { body } = parseFrontMatter(content)
  const plain = body
    .replace(/^#+\s.*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > length ? plain.slice(0, length) + '…' : plain
}
