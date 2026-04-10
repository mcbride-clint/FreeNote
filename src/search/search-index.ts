import Fuse, { FuseResult, IFuseOptions } from 'fuse.js'
import { extractExcerpt, extractTitle } from '../utils/markdown-utils'
import { NoteStore } from '../notes/note-store'

export interface NoteEntry {
  id: string
  name: string
  title: string
  content: string
  excerpt: string
}

const FUSE_OPTIONS: IFuseOptions<NoteEntry> = {
  keys: [
    { name: 'title', weight: 3 },
    { name: 'name', weight: 2 },
    { name: 'content', weight: 1 }
  ],
  includeMatches: true,
  threshold: 0.35,
  minMatchCharLength: 2,
  ignoreLocation: true
}

export class SearchIndex {
  private fuse: Fuse<NoteEntry> = new Fuse([], FUSE_OPTIONS)
  private entries = new Map<string, NoteEntry>()

  buildFromStore(store: NoteStore) {
    this.entries.clear()
    const all = store.allMetas()
    for (const meta of all) {
      const cached = store.get(meta.id)
      if (!cached) continue
      this.entries.set(meta.id, {
        id: meta.id,
        name: meta.name,
        title: extractTitle(cached.content, meta.name),
        content: cached.content,
        excerpt: extractExcerpt(cached.content)
      })
    }
    this.rebuild()
  }

  update(id: string, name: string, content: string) {
    this.entries.set(id, {
      id,
      name,
      title: extractTitle(content, name),
      content,
      excerpt: extractExcerpt(content)
    })
    this.rebuild()
  }

  remove(id: string) {
    if (this.entries.delete(id)) this.rebuild()
  }

  query(term: string): FuseResult<NoteEntry>[] {
    if (!term.trim()) return []
    return this.fuse.search(term, { limit: 20 })
  }

  private rebuild() {
    this.fuse = new Fuse(Array.from(this.entries.values()), FUSE_OPTIONS)
  }
}

export const searchIndex = new SearchIndex()
