import { Decoration, DecorationSet, EditorView, MatchDecorator, ViewPlugin, ViewUpdate } from '@codemirror/view'

const wikiLinkMatcher = new MatchDecorator({
  regexp: /\[\[([^\]]+)\]\]/g,
  decoration: (match) =>
    Decoration.mark({
      class: 'cm-wiki-link',
      attributes: { 'data-note': match[1] }
    })
})

export const wikiLinkExtension = () =>
  ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      constructor(view: EditorView) {
        this.decorations = wikiLinkMatcher.createDeco(view)
      }
      update(update: ViewUpdate) {
        this.decorations = wikiLinkMatcher.updateDeco(update, this.decorations)
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        click(event, view) {
          const target = event.target as HTMLElement
          if (target.classList.contains('cm-wiki-link') || target.closest('.cm-wiki-link')) {
            const el = target.classList.contains('cm-wiki-link')
              ? target
              : (target.closest('.cm-wiki-link') as HTMLElement)
            const name = el?.getAttribute('data-note')
            if (name) {
              event.preventDefault()
              view.dom.dispatchEvent(
                new CustomEvent('markflow:wiki-link', { detail: { name }, bubbles: true })
              )
            }
          }
        }
      }
    }
  )
