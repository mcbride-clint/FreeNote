export class HelpModal {
  private el: HTMLElement

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'help-modal hidden'
    this.el.setAttribute('role', 'dialog')
    this.el.setAttribute('aria-modal', 'true')
    this.el.setAttribute('aria-label', 'Help')
    this.el.innerHTML = `
      <div class="help-backdrop"></div>
      <div class="help-panel">
        <div class="help-header">
          <h2 class="help-title">MarkFlow Help</h2>
          <button class="help-close" aria-label="Close help">✕</button>
        </div>
        <div class="help-body">
          <section class="help-section">
            <h3 class="help-section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              File Handling
            </h3>
            <ul class="help-list">
              <li>Click <kbd>+ New</kbd> or press <kbd>Ctrl N</kbd> to create a note.</li>
              <li>Drag and drop <strong>.md</strong>, <strong>PDF</strong>, or <strong>image</strong> files onto the sidebar to import them.</li>
              <li>PDFs and images are processed with OCR to extract their text content.</li>
              <li>Notes are saved automatically to Google Drive; press <kbd>Ctrl S</kbd> to force-save immediately.</li>
              <li>Select a note in the sidebar and press <kbd>Delete</kbd> in the context menu to remove it.</li>
            </ul>
          </section>

          <section class="help-section">
            <h3 class="help-section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>
              Tags
            </h3>
            <ul class="help-list">
              <li>Add tags via YAML frontmatter at the top of a note:</li>
            </ul>
            <pre class="help-code">---
tags: [research, project-x]
---</pre>
            <ul class="help-list">
              <li>Tags appear as clickable chips in the sidebar — click one to filter notes.</li>
              <li>Multiple tags can be active at once; only notes matching all selected tags are shown.</li>
              <li>Click the tag again (or the <strong>×</strong> on it) to deselect.</li>
            </ul>
          </section>

          <section class="help-section">
            <h3 class="help-section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
              Folders
            </h3>
            <ul class="help-list">
              <li>Assign a note to a folder via YAML frontmatter:</li>
            </ul>
            <pre class="help-code">---
folder: Work / Q2 Planning
---</pre>
            <ul class="help-list">
              <li>Folders appear as collapsible sections in the sidebar — click to expand or collapse.</li>
              <li>Notes without a <code>folder</code> field appear under <strong>Unfiled</strong>.</li>
              <li>Nested folders are supported using <code>/</code> as a separator.</li>
            </ul>
          </section>

          <section class="help-section">
            <h3 class="help-section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              Offline Mode
            </h3>
            <ul class="help-list">
              <li>MarkFlow works offline automatically — notes are cached in the browser using IndexedDB.</li>
              <li>Changes made while offline are queued and synced to Google Drive when you reconnect.</li>
              <li>The toolbar shows sync state: <strong>Ready</strong>, <strong>Saving…</strong>, <strong>Saved</strong>, <strong>Offline — queued</strong>, or <strong>Error</strong>.</li>
              <li>Install MarkFlow as a PWA (via your browser's install prompt) for the best offline experience.</li>
            </ul>
          </section>

          <section class="help-section">
            <h3 class="help-section-title">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
              Keyboard Shortcuts
            </h3>
            <table class="help-shortcuts">
              <tbody>
                <tr><td><kbd>Ctrl K</kbd></td><td>Search notes</td></tr>
                <tr><td><kbd>Ctrl N</kbd></td><td>New note</td></tr>
                <tr><td><kbd>Ctrl S</kbd></td><td>Force save</td></tr>
                <tr><td><kbd>[[…]]</kbd></td><td>Link to another note (WikiLink)</td></tr>
                <tr><td><kbd>Esc</kbd></td><td>Close search / this dialog</td></tr>
              </tbody>
            </table>
          </section>
        </div>
        <div class="help-footer">
          <span>Press <kbd>Esc</kbd> to close</span>
        </div>
      </div>
    `

    this.el.querySelector('.help-backdrop')?.addEventListener('click', () => this.close())
    this.el.querySelector('.help-close')?.addEventListener('click', () => this.close())

    this.el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close()
    })
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.el)
  }

  open() {
    this.el.classList.remove('hidden')
    const closeBtn = this.el.querySelector<HTMLButtonElement>('.help-close')
    requestAnimationFrame(() => closeBtn?.focus())
  }

  close() {
    this.el.classList.add('hidden')
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }
}
