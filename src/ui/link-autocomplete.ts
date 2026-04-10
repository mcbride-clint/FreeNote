import { noteStore } from '../notes/note-store'

export interface LinkAutocompleteCallbacks {
  onInsert: (name: string) => void
}

// Simple popup triggered externally when user types `[[`. Minimal implementation:
// shows note name suggestions, arrow keys navigate, Enter inserts.
export class LinkAutocomplete {
  private el: HTMLDivElement
  private items: string[] = []
  private activeIndex = 0
  private visible = false

  constructor(private callbacks: LinkAutocompleteCallbacks) {
    this.el = document.createElement('div')
    this.el.className = 'link-autocomplete hidden'
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.el)
  }

  showAt(x: number, y: number, query: string) {
    const matches = noteStore
      .names()
      .filter((n) => n.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 8)
    if (!matches.length) {
      this.hide()
      return
    }
    this.items = matches
    this.activeIndex = 0
    this.el.style.left = `${x}px`
    this.el.style.top = `${y}px`
    this.el.classList.remove('hidden')
    this.visible = true
    this.render()
  }

  hide() {
    this.el.classList.add('hidden')
    this.visible = false
  }

  isVisible() {
    return this.visible
  }

  handleKey(e: KeyboardEvent): boolean {
    if (!this.visible) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.activeIndex = (this.activeIndex + 1) % this.items.length
      this.render()
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.activeIndex = (this.activeIndex - 1 + this.items.length) % this.items.length
      this.render()
      return true
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      const selected = this.items[this.activeIndex]
      if (selected) this.callbacks.onInsert(selected)
      this.hide()
      return true
    }
    if (e.key === 'Escape') {
      this.hide()
      return true
    }
    return false
  }

  private render() {
    this.el.innerHTML = this.items
      .map(
        (item, i) =>
          `<div class="link-item ${i === this.activeIndex ? 'active' : ''}" data-name="${escapeAttr(item)}">${escapeHtml(item)}</div>`
      )
      .join('')
    this.el.querySelectorAll<HTMLDivElement>('.link-item').forEach((div) => {
      div.addEventListener('mousedown', (e) => {
        e.preventDefault()
        this.callbacks.onInsert(div.dataset.name!)
        this.hide()
      })
    })
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;')
}
