import { AuthState, googleAuth } from './auth/google-auth'
import { AuthError, DriveClient } from './drive/drive-client'
import { CachedNote, getCached, putCached } from './drive/file-cache'
import { SyncManager, SyncStatus } from './drive/sync-manager'
import { noteStore } from './notes/note-store'
import { NoteEditor } from './notes/note-editor'
import { renderMarkdown } from './notes/note-renderer'
import { searchIndex } from './search/search-index'
import { ocrEngine } from './ocr/ocr-engine'
import { extractPdfText, renderPdfPageToCanvas } from './ocr/pdf-extractor'
import { router } from './router'
import { Sidebar } from './ui/sidebar'
import { Toolbar } from './ui/toolbar'
import { SearchModal } from './ui/search-modal'
import { HelpModal } from './ui/help-modal'
import { LinkAutocomplete } from './ui/link-autocomplete'
import { toast } from './ui/toast'
import { generateId, slugify } from './utils/id-gen'

interface AppState {
  auth: AuthState | null
  drive: DriveClient
  sync: SyncManager
  folderId: string | null
  currentNoteId: string | null
  currentEditor: NoteEditor | null
  view: 'edit' | 'preview' | 'split'
}

export class MarkFlowApp {
  private root: HTMLElement
  private shell: HTMLElement
  private body: HTMLElement
  private mainPane: HTMLElement
  private sidebar: Sidebar
  private toolbar: Toolbar
  private searchModal: SearchModal
  private helpModal: HelpModal
  private linkAutocomplete: LinkAutocomplete
  private state: AppState
  private currentTheme: 'dark' | 'light' = 'dark'
  private linkQueryFrom = 0

  constructor(root: HTMLElement) {
    this.root = root
    this.state = {
      auth: null,
      drive: new DriveClient(() => googleAuth.getValidToken()),
      sync: null as any,
      folderId: null,
      currentNoteId: null,
      currentEditor: null,
      view: 'split'
    }
    this.state.sync = new SyncManager(this.state.drive)

    this.shell = document.createElement('div')
    this.shell.className = 'app-shell'
    this.body = document.createElement('div')
    this.body.className = 'app-body'
    this.mainPane = document.createElement('main')
    this.mainPane.className = 'main-pane'

    this.helpModal = new HelpModal()

    this.toolbar = new Toolbar({
      onMenuToggle: () => this.sidebar.toggle(),
      onSearch: () => this.searchModal.open(),
      onNewNote: () => this.createNewNote(),
      onHelp: () => this.helpModal.open(),
      onThemeToggle: () => this.toggleTheme(),
      onSignIn: () => this.signIn(),
      onSignOut: () => this.signOut()
    })

    this.sidebar = new Sidebar({
      onSelect: (id) => {
        router.navigate(`/note/${id}`)
        if (window.innerWidth <= 768) this.sidebar.setOpen(false)
      },
      onNew: () => this.createNewNote(),
      onDelete: (id) => this.deleteNote(id),
      onImport: (files) => this.importFiles(files)
    })

    this.searchModal = new SearchModal({
      onSelect: (id) => router.navigate(`/note/${id}`)
    })

    this.linkAutocomplete = new LinkAutocomplete({
      onInsert: (name) => this.insertWikiLink(name)
    })
  }

  async mount() {
    this.root.innerHTML = ''
    this.root.appendChild(this.shell)
    this.toolbar.mount(this.shell)
    this.shell.appendChild(this.body)
    this.sidebar.mount(this.body)
    this.body.appendChild(this.mainPane)
    this.searchModal.mount(document.body)
    this.helpModal.mount(document.body)
    this.linkAutocomplete.mount(document.body)

    // Apply saved theme
    const savedTheme = (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark'
    this.applyTheme(savedTheme)

    this.state.sync.onStatusChange((status: SyncStatus, detail) =>
      this.toolbar.setSyncStatus(status, detail)
    )
    this.state.sync.onNoteSaved(async (id) => {
      const latest = await getCached(id)
      if (latest) await noteStore.upsert(latest)
    })

    this.setupGlobalShortcuts()
    this.setupRoutes()

    await noteStore.hydrate()
    searchIndex.buildFromStore(noteStore)

    this.state.auth = await googleAuth.getStored()
    this.toolbar.setUser(this.state.auth)

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) {
      this.renderConfigError()
      return
    }

    try {
      await googleAuth.initialize(clientId)
    } catch (err) {
      toast.show(`Auth init failed: ${(err as Error).message}`, 'error', 6000)
    }

    if (this.state.auth) {
      await this.postSignInBoot()
      if (this.state.auth) {
        router.start()
      } else {
        this.renderSignInPrompt()
      }
    } else {
      this.renderSignInPrompt()
    }
  }

  private applyTheme(theme: 'dark' | 'light') {
    this.currentTheme = theme
    if (theme === 'light') {
      document.documentElement.dataset.theme = 'light'
    } else {
      delete document.documentElement.dataset.theme
    }
    this.toolbar.setTheme(theme)
    localStorage.setItem('theme', theme)
  }

  private toggleTheme() {
    this.applyTheme(this.currentTheme === 'dark' ? 'light' : 'dark')
  }

  private insertWikiLink(name: string) {
    const editor = this.state.currentEditor
    if (!editor) return
    const cursor = editor.getCursor()
    editor.replaceRange(this.linkQueryFrom, cursor, `[[${name}]]`)
    this.linkAutocomplete.hide()
  }

  private setupGlobalShortcuts() {
    document.addEventListener('keydown', (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        this.searchModal.open()
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault()
        this.createNewNote()
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault()
        this.state.currentEditor?.flushNow()
      }
      if (e.key === '?' && !mod && !isTyping(e)) {
        e.preventDefault()
        this.helpModal.open()
      }
      if (e.key === 'Escape' && this.helpModal.isOpen()) {
        this.helpModal.close()
      }
    })

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement
      const wiki = target.closest('a.wiki-link') as HTMLAnchorElement | null
      if (wiki && wiki.dataset.wiki) {
        e.preventDefault()
        this.openWikiLink(wiki.dataset.wiki)
      }
    })

    document.addEventListener('markflow:wiki-link', ((e: CustomEvent<{ name: string }>) => {
      this.openWikiLink(e.detail.name)
    }) as EventListener)
  }

  private setupRoutes() {
    router.on(/^\/?$/, () => this.renderHome())
    router.on(/^\/new$/, (_p, query) => {
      const title = query.get('title') ?? ''
      this.createNewNote(title)
    })
    router.on(/^\/note\/(?<id>[^/]+)$/, ({ id }) => this.openNote(id))
    router.setNotFound(() => this.renderHome())
  }

  private async postSignInBoot() {
    try {
      this.state.folderId = await this.state.drive.ensureFolder()
      await this.syncFromDrive()
      searchIndex.buildFromStore(noteStore)
      if (navigator.onLine) {
        await this.state.sync.flushOfflineQueue()
      }
    } catch (err) {
      if (err instanceof AuthError) {
        //await googleAuth.signOut()
        //this.state.auth = null
        //this.toolbar.setUser(null)
      } else {
        toast.show(`Drive sync failed: ${(err as Error).message}`, 'error', 5000)
      }
    }
  }

  private async syncFromDrive() {
    if (!this.state.folderId) return
    const remote = await this.state.drive.listNotes(this.state.folderId)
    for (const file of remote) {
      const cached = await getCached(file.id)
      const driveTs = new Date(file.modifiedTime).getTime()
      const cachedTs = cached ? new Date(cached.driveModifiedTime).getTime() : 0
      if (!cached || (driveTs > cachedTs && !cached.dirty)) {
        try {
          const content = await this.state.drive.readFile(file.id)
          const note: CachedNote = {
            id: file.id,
            name: file.name,
            content,
            driveModifiedTime: file.modifiedTime,
            localModifiedAt: driveTs,
            dirty: false
          }
          await putCached(note)
          await noteStore.upsert(note)
        } catch (err) {
          console.error('read failed', file.name, err)
        }
      }
    }
    await this.state.sync.setLastSyncedAt(Date.now())
  }

  private async signIn() {
    try {
      const auth = await googleAuth.signIn()
      this.state.auth = auth
      this.toolbar.setUser(auth)
      toast.show(`Signed in as ${auth.userInfo.name}`, 'success')
      await this.postSignInBoot()
      router.start()
    } catch (err) {
      toast.show(`Sign-in failed: ${(err as Error).message}`, 'error', 5000)
    }
  }

  private async signOut() {
    await googleAuth.signOut()
    this.state.auth = null
    this.toolbar.setUser(null)
    this.renderSignInPrompt()
  }

  private async createNewNote(title = '') {
    if (!this.state.auth || !this.state.folderId) {
      toast.show('Please sign in first', 'error')
      return
    }
    const safeTitle = (title || 'Untitled note').trim()
    const filename = `${slugify(safeTitle) || generateId().slice(0, 8)}.md`
    const initialContent = title ? `# ${safeTitle}\n\n` : '# Untitled\n\n'
    try {
      const created = await this.state.drive.createFile(this.state.folderId, filename, initialContent)
      const note: CachedNote = {
        id: created.id,
        name: created.name,
        content: initialContent,
        driveModifiedTime: created.modifiedTime,
        localModifiedAt: Date.now(),
        dirty: false
      }
      await noteStore.upsert(note)
      searchIndex.update(note.id, note.name, note.content)
      router.navigate(`/note/${note.id}`)
    } catch (err) {
      toast.show(`Create failed: ${(err as Error).message}`, 'error', 5000)
    }
  }

  private async deleteNote(id: string) {
    try {
      await this.state.drive.deleteFile(id)
    } catch (err) {
      toast.show(`Delete on Drive failed: ${(err as Error).message}`, 'error')
    }
    await noteStore.remove(id)
    searchIndex.remove(id)
    if (this.state.currentNoteId === id) {
      this.state.currentNoteId = null
      router.navigate('/')
    }
  }

  private async openNote(id: string) {
    const content = await noteStore.fetchContent(id)
    if (content === null) {
      toast.show('Note not found', 'error')
      router.navigate('/')
      return
    }
    this.state.currentNoteId = id
    this.sidebar.setActive(id)
    this.renderNote(id, content)
  }

  private renderNote(id: string, content: string) {
    const note = noteStore.get(id)
    if (!note) return
    this.mainPane.innerHTML = ''

    const header = document.createElement('div')
    header.className = 'note-toolbar'
    header.innerHTML = `
      <input type="text" class="title-input" value="${escapeAttr(displayName(note.name))}" />
      <button data-action="bold" title="Bold (Ctrl+B)"><b>B</b></button>
      <button data-action="italic" title="Italic (Ctrl+I)"><i>I</i></button>
      <button data-action="heading" title="Heading">H</button>
      <button data-action="code" title="Inline code">&lt;/&gt;</button>
      <button data-action="link" title="Link">🔗</button>
      <button data-action="wiki" title="Wiki link">[[]]</button>
      <button data-action="divider" title="Divider">—</button>
      <button class="view-toggle ${this.state.view === 'edit' ? 'active' : ''}" data-view="edit">Edit</button>
      <button class="view-toggle ${this.state.view === 'split' ? 'active' : ''}" data-view="split">Split</button>
      <button class="view-toggle ${this.state.view === 'preview' ? 'active' : ''}" data-view="preview">Preview</button>
    `
    this.mainPane.appendChild(header)

    const area = document.createElement('div')
    area.className = 'editor-area'
    this.mainPane.appendChild(area)

    const editorEl = document.createElement('div')
    editorEl.className = 'editor-pane'
    const previewEl = document.createElement('div')
    previewEl.className = 'preview-pane'
    const previewContent = document.createElement('div')
    previewContent.className = 'rendered'
    const backlinksEl = document.createElement('div')
    previewEl.appendChild(previewContent)
    previewEl.appendChild(backlinksEl)

    const updatePanes = () => {
      editorEl.style.display = this.state.view === 'preview' ? 'none' : ''
      previewEl.style.display = this.state.view === 'edit' ? 'none' : ''
    }

    area.appendChild(editorEl)
    area.appendChild(previewEl)
    updatePanes()

    this.state.currentEditor?.destroy()
    const editor = new NoteEditor({
      container: editorEl,
      initialContent: content,
      onChange: (newContent) => this.handleNoteChange(id, newContent, previewContent, backlinksEl),
      onWikiLinkQuery: (query, x, y, from) => {
        this.linkQueryFrom = from
        this.linkAutocomplete.showAt(x, y + 4, query)
      },
      onWikiLinkQueryClear: () => this.linkAutocomplete.hide(),
      onKeyDown: (e) => this.linkAutocomplete.handleKey(e),
      onImagePaste: (blob) => this.handleImagePaste(blob)
    })
    this.state.currentEditor = editor

    previewContent.innerHTML = renderMarkdown(content)
    this.renderBacklinks(id, backlinksEl)

    // Re-render backlinks when any note changes (another note may now link here)
    const onStoreChange = () => {
      if (this.state.currentNoteId === id) {
        this.renderBacklinks(id, backlinksEl)
      }
    }
    noteStore.addEventListener('change', onStoreChange)
    // Clean up listener when note is replaced
    const origDestroy = editor.destroy.bind(editor)
    editor.destroy = () => {
      noteStore.removeEventListener('change', onStoreChange)
      origDestroy()
    }

    // Title input handler
    const titleInput = header.querySelector('.title-input') as HTMLInputElement
    titleInput.addEventListener('change', async () => {
      const newName = titleInput.value.trim()
      if (!newName) return
      try {
        const updated = await this.state.drive.renameFile(id, newName)
        const latest = noteStore.get(id)
        if (latest) {
          const next: CachedNote = { ...latest, name: updated.name, driveModifiedTime: updated.modifiedTime }
          await noteStore.upsert(next)
          searchIndex.update(next.id, next.name, next.content)
        }
      } catch (err) {
        toast.show(`Rename failed: ${(err as Error).message}`, 'error')
      }
    })

    // Toolbar actions
    header.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => this.handleEditorAction(btn.dataset.action!))
    })

    // View toggle
    header.querySelectorAll<HTMLButtonElement>('button[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.view = btn.dataset.view as AppState['view']
        header.querySelectorAll('button[data-view]').forEach((b) => b.classList.remove('active'))
        btn.classList.add('active')
        updatePanes()
      })
    })

    editor.focus()
  }

  private renderBacklinks(noteId: string, container: HTMLElement) {
    const backlinks = noteStore.getBacklinks(noteId)
    if (backlinks.length === 0) {
      container.innerHTML = ''
      return
    }
    const items = backlinks
      .map(n => `<li><a href="#/note/${n.id}" class="wiki-link" data-wiki="${escapeAttr(n.title)}">${escapeHtml(n.title)}</a></li>`)
      .join('')
    container.innerHTML = `
      <div class="backlinks-section">
        <p class="backlinks-title">Referenced by</p>
        <ul class="backlinks-list">${items}</ul>
      </div>
    `
  }

  private handleNoteChange(id: string, content: string, previewContent: HTMLElement, backlinksEl: HTMLElement) {
    const note = noteStore.get(id)
    if (!note) return
    const updated: CachedNote = {
      ...note,
      content,
      localModifiedAt: Date.now(),
      dirty: true
    }
    void noteStore.upsert(updated)
    searchIndex.update(id, note.name, content)
    previewContent.innerHTML = renderMarkdown(content)
    this.renderBacklinks(id, backlinksEl)
    this.state.sync.scheduleWrite(id, content)
  }

  private handleEditorAction(action: string) {
    const editor = this.state.currentEditor
    if (!editor) return
    switch (action) {
      case 'bold': editor.wrapSelection('**'); break
      case 'italic': editor.wrapSelection('*'); break
      case 'heading': editor.insertAtCursor('\n## '); break
      case 'code': editor.wrapSelection('`'); break
      case 'link': editor.wrapSelection('[', '](url)'); break
      case 'wiki': editor.wrapSelection('[[', ']]'); break
      case 'divider': editor.insertAtCursor('\n\n---\n\n'); break
    }
  }

  private async handleImagePaste(blob: Blob) {
    const editor = this.state.currentEditor
    if (!editor) return
    try {
      const dataUri = await blobToDataUri(blob)
      const ext = blob.type.split('/')[1] || 'png'
      editor.insertAtCursor(`![pasted image](${dataUri})`)
      toast.show(`Image pasted (${ext.toUpperCase()}, ${formatBytes(blob.size)})`, 'success')
    } catch (err) {
      toast.show(`Image paste failed: ${(err as Error).message}`, 'error')
    }
  }

  private openWikiLink(name: string) {
    const existing = noteStore.findByName(name)
    if (existing) {
      router.navigate(`/note/${existing.id}`)
    } else {
      router.navigate(`/new?title=${encodeURIComponent(name)}`)
    }
  }

  private renderHome() {
    this.state.currentNoteId = null
    this.sidebar.setActive(null)
    this.mainPane.innerHTML = ''
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    const noteCount = noteStore.list().length
    empty.innerHTML = `
      <h2>Welcome to MarkFlow</h2>
      <p>${noteCount === 0
        ? 'Your notes live in the root of your Google Drive. Create your first note to get started.'
        : `You have ${noteCount} note${noteCount === 1 ? '' : 's'}. Open one from the sidebar or create a new one.`}</p>
      <button>+ Create a new note</button>
    `
    empty.querySelector('button')?.addEventListener('click', () => this.createNewNote())
    this.mainPane.appendChild(empty)
  }

  private renderSignInPrompt() {
    this.mainPane.innerHTML = ''
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = `
      <h2>Sign in to get started</h2>
      <p>MarkFlow stores your notes in the root of your Google Drive. Sign in with Google to continue.</p>
      <button>Sign in with Google</button>
    `
    empty.querySelector('button')?.addEventListener('click', () => this.signIn())
    this.mainPane.appendChild(empty)
  }

  private renderConfigError() {
    this.mainPane.innerHTML = ''
    const empty = document.createElement('div')
    empty.className = 'empty-state'
    empty.innerHTML = `
      <h2>Configuration required</h2>
      <p>Set <code>VITE_GOOGLE_CLIENT_ID</code> in your <code>.env</code> file. See the README for setup steps.</p>
    `
    this.mainPane.appendChild(empty)
  }

  private async importFiles(files: FileList) {
    if (!this.state.auth || !this.state.folderId) {
      toast.show('Please sign in first', 'error')
      return
    }
    for (const file of Array.from(files)) {
      await this.importFile(file)
    }
  }

  private async importFile(file: File) {
    const handle = toast.show(`Importing ${file.name}…`, 'progress')
    try {
      let text = ''
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
        handle.update(`Extracting text from ${file.name}…`, 10)
        const result = await extractPdfText(file)
        if (result.needsOcr) {
          handle.update(`Running OCR on ${file.name}…`, 20)
          const pageTexts: string[] = []
          for (let p = 1; p <= result.pdf.numPages; p++) {
            const canvas = await renderPdfPageToCanvas(result.pdf, p)
            const pageText = await ocrEngine.extractFromCanvas(canvas, (pct) => {
              const overall = Math.round(((p - 1) / result.pdf.numPages) * 100 + pct / result.pdf.numPages)
              handle.update(`OCR ${file.name} page ${p}/${result.pdf.numPages}`, overall)
            })
            pageTexts.push(pageText)
          }
          text = pageTexts.join('\n\n---\n\n')
        } else {
          text = result.text
        }
      } else if (file.type.startsWith('image/')) {
        text = await ocrEngine.extractFromImage(file, (pct, status) => {
          handle.update(`${status}: ${file.name}`, pct)
        })
      } else if (
        file.name.endsWith('.md') ||
        file.name.endsWith('.txt') ||
        file.type === 'text/markdown' ||
        file.type === 'text/plain'
      ) {
        text = await file.text()
      } else {
        throw new Error(`Unsupported file type: ${file.type || 'unknown'}`)
      }

      const date = new Date().toISOString().slice(0, 10)
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const noteName = `${baseName} - ${date}.md`
      const isMarkdown = file.name.endsWith('.md') || file.type === 'text/markdown'
      const content = isMarkdown
        ? text
        : `# Imported: ${baseName}\n\n> Imported from \`${file.name}\` on ${date}\n\n${text.trim()}\n`
      const created = await this.state.drive.createFile(this.state.folderId!, noteName, content)
      const note: CachedNote = {
        id: created.id,
        name: created.name,
        content,
        driveModifiedTime: created.modifiedTime,
        localModifiedAt: Date.now(),
        dirty: false
      }
      await noteStore.upsert(note)
      searchIndex.update(note.id, note.name, note.content)
      handle.dismiss()
      toast.show(`Imported ${file.name}`, 'success')
    } catch (err) {
      handle.dismiss()
      toast.show(`Import failed: ${(err as Error).message}`, 'error', 6000)
    }
  }
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function isTyping(e: KeyboardEvent): boolean {
  const el = e.target as HTMLElement
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}

function displayName(name: string): string {
  return name.replace(/\.md$/i, '')
}

function blobToDataUri(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
