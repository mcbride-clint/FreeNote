import { EditorState } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { basicSetup } from 'codemirror'
import { debounce } from '../utils/debounce'
import { wikiLinkExtension } from './wiki-link-extension'
import { markflowTheme } from './editor-theme'

export interface NoteEditorOptions {
  container: HTMLElement
  initialContent: string
  onChange: (content: string) => void
  debounceMs?: number
  onWikiLinkQuery?: (query: string, x: number, y: number, from: number) => void
  onWikiLinkQueryClear?: () => void
  onKeyDown?: (e: KeyboardEvent) => boolean
  onImagePaste?: (blob: Blob) => void
}

export class NoteEditor {
  private view: EditorView
  private flush: (content: string) => void
  private opts: NoteEditorOptions

  constructor(opts: NoteEditorOptions) {
    const { container, initialContent, onChange, debounceMs = 1500 } = opts
    this.opts = opts
    this.flush = onChange
    const debouncedSave = debounce((content: string) => onChange(content), debounceMs)

    this.view = new EditorView({
      state: EditorState.create({
        doc: initialContent,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          EditorView.lineWrapping,
          markdown({ base: markdownLanguage, codeLanguages: [] }),
          wikiLinkExtension(),
          markflowTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              debouncedSave(update.state.doc.toString())
            }
            if (update.docChanged || update.selectionSet) {
              this.checkWikiLinkQuery()
            }
          }),
          EditorView.domEventHandlers({
            paste: (e) => {
              if (!this.opts.onImagePaste) return false
              const items = e.clipboardData?.items
              if (!items) return false
              for (const item of Array.from(items)) {
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                  const blob = item.getAsFile()
                  if (blob) {
                    e.preventDefault()
                    this.opts.onImagePaste(blob)
                    return true
                  }
                }
              }
              return false
            }
          })
        ]
      }),
      parent: container
    })

    // Capture-phase keydown so our handler fires before CodeMirror's keymaps
    this.view.dom.addEventListener('keydown', (e) => {
      if (this.opts.onKeyDown?.(e)) {
        e.preventDefault()
        e.stopPropagation()
      }
    }, true)
  }

  private checkWikiLinkQuery() {
    const state = this.view.state
    const cursor = state.selection.main.head
    const line = state.doc.lineAt(cursor)
    const textBefore = line.text.slice(0, cursor - line.from)
    const match = textBefore.match(/\[\[([^\]]*)$/)
    if (match) {
      const query = match[1]
      const from = cursor - query.length - 2
      const coords = this.view.coordsAtPos(cursor)
      if (coords) {
        this.opts.onWikiLinkQuery?.(query, coords.left, coords.bottom, from)
      }
    } else {
      this.opts.onWikiLinkQueryClear?.()
    }
  }

  setContent(content: string) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: content }
    })
  }

  getContent(): string {
    return this.view.state.doc.toString()
  }

  getCursor(): number {
    return this.view.state.selection.main.head
  }

  flushNow() {
    this.flush(this.getContent())
  }

  insertAtCursor(text: string) {
    const sel = this.view.state.selection.main
    this.view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from + text.length }
    })
    this.view.focus()
  }

  replaceRange(from: number, to: number, text: string) {
    this.view.dispatch({
      changes: { from, to, insert: text },
      selection: { anchor: from + text.length }
    })
    this.view.focus()
  }

  wrapSelection(before: string, after = before) {
    const sel = this.view.state.selection.main
    const selected = this.view.state.doc.sliceString(sel.from, sel.to)
    const insert = `${before}${selected}${after}`
    this.view.dispatch({
      changes: { from: sel.from, to: sel.to, insert },
      selection: { anchor: sel.from + before.length, head: sel.from + before.length + selected.length }
    })
    this.view.focus()
  }

  focus() {
    this.view.focus()
  }

  destroy() {
    this.view.destroy()
  }
}
