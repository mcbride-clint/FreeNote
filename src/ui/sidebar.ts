import { NoteMeta, noteStore } from '../notes/note-store'

export interface SidebarCallbacks {
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onImport: (files: FileList) => void
}

export class Sidebar {
  private el: HTMLElement
  private listEl: HTMLElement
  private tagsEl: HTMLElement
  private currentId: string | null = null
  private selectedTag: string | null = null

  constructor(private callbacks: SidebarCallbacks) {
    this.el = document.createElement('aside')
    this.el.className = 'sidebar'
    this.el.innerHTML = `
      <div class="sidebar-header">
        <button class="sidebar-new">+ New Note</button>
      </div>
      <div class="sidebar-dropzone" aria-label="Drop PDF, image, or markdown to import">
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.md,.txt" multiple hidden />
        <div class="dropzone-label">Drop PDF, image, or .md<br /><small>or click to import</small></div>
      </div>
      <div class="sidebar-tags"></div>
      <nav class="sidebar-list" aria-label="Notes">
        <div class="sidebar-notes"></div>
      </nav>
    `

    this.tagsEl = this.el.querySelector('.sidebar-tags') as HTMLElement
    this.listEl = this.el.querySelector('.sidebar-notes') as HTMLElement
    this.el.querySelector('.sidebar-new')?.addEventListener('click', () => callbacks.onNew())

    const dropzone = this.el.querySelector('.sidebar-dropzone') as HTMLDivElement
    const fileInput = dropzone.querySelector('input') as HTMLInputElement
    dropzone.addEventListener('click', () => fileInput.click())
    fileInput.addEventListener('change', () => {
      if (fileInput.files?.length) {
        callbacks.onImport(fileInput.files)
        fileInput.value = ''
      }
    })

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault()
      dropzone.classList.add('drag-over')
    })
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'))
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault()
      dropzone.classList.remove('drag-over')
      if (e.dataTransfer?.files.length) callbacks.onImport(e.dataTransfer.files)
    })

    noteStore.addEventListener('change', () => this.render())
    this.render()
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.el)
  }

  setOpen(open: boolean) {
    this.el.classList.toggle('open', open)
  }

  toggle() {
    this.el.classList.toggle('open')
  }

  setActive(id: string | null) {
    this.currentId = id
    this.el.querySelectorAll('li[data-id]').forEach((li) => {
      ;(li as HTMLElement).classList.toggle('active', (li as HTMLElement).dataset.id === id)
    })
  }

  render() {
    const allNotes = noteStore.list()

    // Collect all unique tags
    const tagSet = new Set<string>()
    for (const note of allNotes) {
      for (const tag of note.tags) tagSet.add(tag)
    }
    const tags = Array.from(tagSet).sort()

    // Render tag chips
    if (tags.length > 0) {
      this.tagsEl.innerHTML = tags
        .map(
          (t) =>
            `<button class="tag-chip${t === this.selectedTag ? ' active' : ''}" data-tag="${escapeAttr(t)}">#${escapeHtml(t)}</button>`
        )
        .join('')
      this.tagsEl.querySelectorAll<HTMLButtonElement>('.tag-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const tag = btn.dataset.tag!
          this.selectedTag = this.selectedTag === tag ? null : tag
          this.render()
        })
      })
    } else {
      this.tagsEl.innerHTML = ''
    }

    // Filter by selected tag
    const notes = this.selectedTag
      ? allNotes.filter((n) => n.tags.includes(this.selectedTag!))
      : allNotes

    if (notes.length === 0) {
      this.listEl.innerHTML = '<p class="sidebar-empty">No notes found.</p>'
      return
    }

    // Group by folder
    const foldered = new Map<string, NoteMeta[]>()
    const unfoldered: NoteMeta[] = []

    for (const note of notes) {
      if (note.folder) {
        const arr = foldered.get(note.folder) ?? []
        arr.push(note)
        foldered.set(note.folder, arr)
      } else {
        unfoldered.push(note)
      }
    }

    const sortedFolders = Array.from(foldered.keys()).sort((a, b) => a.localeCompare(b))

    let html = ''

    // Render folders first
    for (const folder of sortedFolders) {
      const isOpen = localStorage.getItem(`folder:${folder}:open`) !== 'false'
      html += `<details class="sidebar-folder"${isOpen ? ' open' : ''} data-folder="${escapeAttr(folder)}">
        <summary class="sidebar-folder-name">
          <span class="folder-icon">▶</span>
          ${escapeHtml(folder)}
        </summary>
        <ul>${foldered.get(folder)!.map((n) => this.renderItem(n)).join('')}</ul>
      </details>`
    }

    // Render unfoldered notes
    if (unfoldered.length > 0) {
      html += `<ul class="sidebar-root-list">${unfoldered.map((n) => this.renderItem(n)).join('')}</ul>`
    }

    this.listEl.innerHTML = html

    // Persist folder open/close state
    this.listEl.querySelectorAll<HTMLDetailsElement>('details.sidebar-folder').forEach((details) => {
      details.addEventListener('toggle', () => {
        const name = details.dataset.folder!
        localStorage.setItem(`folder:${name}:open`, String(details.open))
        // Rotate arrow icon
        const icon = details.querySelector('.folder-icon') as HTMLElement | null
        if (icon) icon.style.transform = details.open ? 'rotate(90deg)' : ''
      })
      // Set initial arrow state
      const icon = details.querySelector('.folder-icon') as HTMLElement | null
      if (icon) icon.style.transform = details.open ? 'rotate(90deg)' : ''
    })

    // Wire up note click / delete handlers
    this.listEl.querySelectorAll<HTMLLIElement>('li[data-id]').forEach((li) => {
      const id = li.dataset.id!
      li.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.note-delete')) return
        this.callbacks.onSelect(id)
      })
      li.querySelector('.note-delete')?.addEventListener('click', (e) => {
        e.stopPropagation()
        if (confirm('Delete this note?')) this.callbacks.onDelete(id)
      })
    })

    this.setActive(this.currentId)
  }

  private renderItem(note: NoteMeta): string {
    const date = new Date(note.localModifiedAt).toLocaleDateString()
    const tagsHtml =
      note.tags.length > 0
        ? `<div class="note-tags">${note.tags.map((t) => `<span class="note-tag">#${escapeHtml(t)}</span>`).join('')}</div>`
        : ''
    return `
      <li data-id="${escapeAttr(note.id)}">
        <div class="note-title">${escapeHtml(note.title)}${note.dirty ? ' <span class="dirty-dot" title="Unsaved">•</span>' : ''}</div>
        <div class="note-meta">
          <span>${escapeHtml(date)}</span>
          <button class="note-delete" aria-label="Delete note">×</button>
        </div>
        ${tagsHtml}
        <div class="note-excerpt">${escapeHtml(note.excerpt)}</div>
      </li>
    `
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
