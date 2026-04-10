import { CachedNote, listCached, putCached, deleteCached, getCached } from '../drive/file-cache'
import { extractExcerpt, extractFolder, extractTags, extractTitle } from '../utils/markdown-utils'

export interface NoteMeta {
  id: string
  name: string
  title: string
  excerpt: string
  driveModifiedTime: string
  localModifiedAt: number
  dirty: boolean
  tags: string[]
  folder?: string
}

export class NoteStore extends EventTarget {
  private notes = new Map<string, CachedNote>()

  async hydrate(): Promise<void> {
    const cached = await listCached()
    for (const note of cached) this.notes.set(note.id, note)
    this.emitChange()
  }

  list(): NoteMeta[] {
    return Array.from(this.notes.values())
      .map(toMeta)
      .sort((a, b) => b.localModifiedAt - a.localModifiedAt)
  }

  get(id: string): CachedNote | undefined {
    return this.notes.get(id)
  }

  async fetchContent(id: string): Promise<string | null> {
    const existing = this.notes.get(id)
    if (existing) return existing.content
    const persisted = await getCached(id)
    if (persisted) {
      this.notes.set(id, persisted)
      return persisted.content
    }
    return null
  }

  findByName(name: string): CachedNote | undefined {
    const normalized = stripMd(name).toLowerCase()
    for (const note of this.notes.values()) {
      if (stripMd(note.name).toLowerCase() === normalized) return note
    }
    return undefined
  }

  async upsert(note: CachedNote): Promise<void> {
    this.notes.set(note.id, note)
    await putCached(note)
    this.emitChange()
  }

  async remove(id: string): Promise<void> {
    this.notes.delete(id)
    await deleteCached(id)
    this.emitChange()
  }

  allMetas(): NoteMeta[] {
    return this.list()
  }

  names(): string[] {
    return Array.from(this.notes.values()).map(n => stripMd(n.name))
  }

  getBacklinks(noteId: string): NoteMeta[] {
    const note = this.notes.get(noteId)
    if (!note) return []
    const targetName = stripMd(note.name).toLowerCase()
    const result: NoteMeta[] = []
    for (const other of this.notes.values()) {
      if (other.id === noteId) continue
      const links = extractWikiLinks(other.content).map(l => l.toLowerCase())
      if (links.includes(targetName)) result.push(toMeta(other))
    }
    return result
  }

  private emitChange() {
    this.dispatchEvent(new Event('change'))
  }
}

function stripMd(name: string): string {
  return name.replace(/\.md$/i, '')
}

function extractWikiLinks(content: string): string[] {
  const result: string[] = []
  for (const match of content.matchAll(/\[\[([^\]]+)\]\]/g)) {
    result.push(match[1].trim())
  }
  return result
}

function toMeta(note: CachedNote): NoteMeta {
  return {
    id: note.id,
    name: note.name,
    title: extractTitle(note.content, stripMd(note.name)),
    excerpt: extractExcerpt(note.content),
    driveModifiedTime: note.driveModifiedTime,
    localModifiedAt: note.localModifiedAt,
    dirty: note.dirty,
    tags: extractTags(note.content),
    folder: extractFolder(note.content),
  }
}

export const noteStore = new NoteStore()
