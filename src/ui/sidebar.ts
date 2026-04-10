import { NoteMeta, noteStore } from '../notes/note-store'

export interface SidebarCallbacks {
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
  onImport: (files: FileList) => void
}

export class Sidebar {
  private el: HTMLElement
  private listEl: HTMLUListElement
  private currentId: string | null = null

  constructor(private callbacks: SidebarCallbacks) {
    this.el = document.createElement('aside')
    this.el.className = 'sidebar'
    this.el.innerHTML = `
      <div class="sidebar-header">
        <button class="sidebar-new">+ New Note</button>
      </div>
      <div class="sidebar-dropzone" aria-label="Drop PDF or image to import">
        <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" multiple hidden />
        <div class="dropzone-label">Drop PDF or image<br /><small>or click to import</small></div>
      </div>
      <nav class="sidebar-list" aria-label="Notes">
        <ul></ul>
      </nav>
    `

    this.listEl = this.el.querySelector('ul') as HTMLUListElement
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
    this.listEl.querySelectorAll('li').forEach((li) => {
      li.classList.toggle('active', li.dataset.id === id)
    })
  }

  render() {
    const notes = noteStore.list()
    this.listEl.innerHTML = notes.length === 0
      ? '<li class="empty">No notes yet. Create one to get started.</li>'
      : notes.map((note) => this.renderItem(note)).join('')

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
    return `
      <li data-id="${note.id}">
        <div class="note-title">${escapeHtml(note.title)}${note.dirty ? ' <span class="dirty-dot" title="Unsaved">•</span>' : ''}</div>
        <div class="note-meta">
          <span>${escapeHtml(date)}</span>
          <button class="note-delete" aria-label="Delete note">×</button>
        </div>
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
