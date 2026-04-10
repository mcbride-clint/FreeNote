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
  private state: AppState

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

    this.toolbar = new Toolbar({
      onMenuToggle: () => this.sidebar.toggle(),
      onSearch: () => this.searchModal.open(),
      onNewNote: () => this.createNewNote(),
      onSignIn: () => this.signIn(),
      onSignOut: () => this.signOut()
    })

    this.sidebar = new Sidebar({
      onSelect: (id) => router.navigate(`/note/${id}`),
      onNew: () => this.createNewNote(),
      onDelete: (id) => this.deleteNote(id),
      onImport: (files) => this.importFiles(files)
    })

    this.searchModal = new SearchModal({
      onSelect: (id) => router.navigate(`/note/${id}`)
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
      this.state.folderId = await this.state.drive.ensureFolder('MarkFlow')
      await this.syncFromDrive()
      searchIndex.buildFromStore(noteStore)
      if (navigator.onLine) {
        await this.state.sync.flushOfflineQueue()
      }
    } catch (err) {
      if (err instanceof AuthError) {
        await googleAuth.signOut()
        this.state.auth = null
        this.toolbar.setUser(null)
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
    previewEl.appendChild(previewContent)

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
      onChange: (newContent) => this.handleNoteChange(id, newContent, previewContent)
    })
    this.state.currentEditor = editor

    previewContent.innerHTML = renderMarkdown(content)

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

  private handleNoteChange(id: string, content: string, previewContent: HTMLElement) {
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
        ? 'Your notes live in a MarkFlow folder on your Google Drive. Create your first note to get started.'
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
      <p>MarkFlow stores your notes in a private folder on your Google Drive. Sign in with Google to continue.</p>
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
      } else {
        throw new Error(`Unsupported file type: ${file.type || 'unknown'}`)
      }

      const date = new Date().toISOString().slice(0, 10)
      const baseName = file.name.replace(/\.[^.]+$/, '')
      const noteName = `Imported - ${baseName} - ${date}.md`
      const content = `# Imported: ${baseName}\n\n> Imported from \`${file.name}\` on ${date}\n\n${text.trim()}\n`
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

function displayName(name: string): string {
  return name.replace(/\.md$/i, '')
}
