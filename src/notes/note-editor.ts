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
}

export class NoteEditor {
  private view: EditorView
  private flush: (content: string) => void

  constructor({ container, initialContent, onChange, debounceMs = 1500 }: NoteEditorOptions) {
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
          })
        ]
      }),
      parent: container
    })
  }

  setContent(content: string) {
    this.view.dispatch({
      changes: { from: 0, to: this.view.state.doc.length, insert: content }
    })
  }

  getContent(): string {
    return this.view.state.doc.toString()
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
