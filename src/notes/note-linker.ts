import { noteStore } from './note-store'

const LINK_REGEX = /\[\[([^\]]+)\]\]/g

export function findWikiLinks(content: string): string[] {
  const result: string[] = []
  for (const match of content.matchAll(LINK_REGEX)) {
    result.push(match[1].trim())
  }
  return result
}

export function resolveLink(name: string): { exists: boolean; id?: string; href: string } {
  const existing = noteStore.findByName(name)
  if (existing) {
    return { exists: true, id: existing.id, href: `#/note/${existing.id}` }
  }
  return { exists: false, href: `#/new?title=${encodeURIComponent(name)}` }
}
