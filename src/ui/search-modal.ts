import { searchIndex } from '../search/search-index'
import { debounce } from '../utils/debounce'

export interface SearchModalCallbacks {
  onSelect: (id: string) => void
}

export class SearchModal {
  private el: HTMLElement
  private input: HTMLInputElement
  private resultsEl: HTMLUListElement
  private activeIndex = 0
  private lastResults: { id: string; title: string; excerpt: string }[] = []

  constructor(private callbacks: SearchModalCallbacks) {
    this.el = document.createElement('div')
    this.el.className = 'search-modal hidden'
    this.el.setAttribute('role', 'dialog')
    this.el.setAttribute('aria-modal', 'true')
    this.el.innerHTML = `
      <div class="search-backdrop"></div>
      <div class="search-panel">
        <input type="search" class="search-input" placeholder="Search notes…" autocomplete="off" spellcheck="false" />
        <ul class="search-results" role="listbox"></ul>
        <div class="search-hint">
          <kbd>↑↓</kbd> navigate
          <kbd>Enter</kbd> open
          <kbd>Esc</kbd> close
        </div>
      </div>
    `
    this.input = this.el.querySelector('.search-input') as HTMLInputElement
    this.resultsEl = this.el.querySelector('.search-results') as HTMLUListElement

    this.el.querySelector('.search-backdrop')?.addEventListener('click', () => this.close())

    const debouncedSearch = debounce((term: string) => this.runSearch(term), 120)
    this.input.addEventListener('input', () => debouncedSearch(this.input.value))
    this.input.addEventListener('keydown', (e) => this.handleKey(e))
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.el)
  }

  open() {
    this.el.classList.remove('hidden')
    this.input.value = ''
    this.resultsEl.innerHTML = ''
    this.lastResults = []
    this.activeIndex = 0
    requestAnimationFrame(() => this.input.focus())
  }

  close() {
    this.el.classList.add('hidden')
  }

  isOpen(): boolean {
    return !this.el.classList.contains('hidden')
  }

  private runSearch(term: string) {
    const results = searchIndex.query(term)
    this.lastResults = results.map((r) => ({
      id: r.item.id,
      title: r.item.title || r.item.name,
      excerpt: r.item.excerpt
    }))
    this.activeIndex = 0
    this.renderResults()
  }

  private renderResults() {
    if (!this.lastResults.length) {
      this.resultsEl.innerHTML = this.input.value
        ? '<li class="empty">No matches</li>'
        : ''
      return
    }
    this.resultsEl.innerHTML = this.lastResults
      .map(
        (r, i) => `
          <li class="search-result ${i === this.activeIndex ? 'active' : ''}" data-id="${r.id}">
            <div class="search-result-title">${escapeHtml(r.title)}</div>
            <div class="search-result-excerpt">${escapeHtml(r.excerpt)}</div>
          </li>
        `
      )
      .join('')
    this.resultsEl.querySelectorAll<HTMLLIElement>('li[data-id]').forEach((li) => {
      li.addEventListener('click', () => {
        this.callbacks.onSelect(li.dataset.id!)
        this.close()
      })
    })
  }

  private handleKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.close()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      this.activeIndex = Math.min(this.lastResults.length - 1, this.activeIndex + 1)
      this.renderResults()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      this.activeIndex = Math.max(0, this.activeIndex - 1)
      this.renderResults()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const selected = this.lastResults[this.activeIndex]
      if (selected) {
        this.callbacks.onSelect(selected.id)
        this.close()
      }
    }
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
