import { AuthState } from '../auth/google-auth'
import { SyncStatus } from '../drive/sync-manager'

export interface ToolbarCallbacks {
  onMenuToggle: () => void
  onSearch: () => void
  onNewNote: () => void
  onHelp: () => void
  onThemeToggle: () => void
  onSignIn: () => void
  onSignOut: () => void
}

export class Toolbar {
  private el: HTMLElement
  private syncEl: HTMLSpanElement
  private userEl: HTMLDivElement
  private themeBtn: HTMLButtonElement

  constructor(private callbacks: ToolbarCallbacks) {
    this.el = document.createElement('header')
    this.el.className = 'toolbar'
    this.el.innerHTML = `
      <button class="toolbar-btn menu-toggle" aria-label="Toggle sidebar">
        <span class="hamburger"></span>
      </button>
      <div class="toolbar-brand">MarkFlow</div>
      <button class="toolbar-btn search-btn" aria-label="Search (Ctrl+K)">
        <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <span class="search-label">Search</span>
        <kbd>⌘K</kbd>
      </button>
      <div class="toolbar-spacer"></div>
      <button class="toolbar-btn new-btn" aria-label="New note">+ New</button>
      <button class="toolbar-btn help-btn" aria-label="Help">?</button>
      <button class="toolbar-btn theme-toggle-btn" aria-label="Toggle theme" title="Toggle light/dark mode">☀</button>
      <span class="sync-status" data-status="idle">Ready</span>
      <div class="user-area"></div>
    `
    this.syncEl = this.el.querySelector('.sync-status') as HTMLSpanElement
    this.userEl = this.el.querySelector('.user-area') as HTMLDivElement
    this.themeBtn = this.el.querySelector('.theme-toggle-btn') as HTMLButtonElement

    this.el.querySelector('.menu-toggle')?.addEventListener('click', () => callbacks.onMenuToggle())
    this.el.querySelector('.search-btn')?.addEventListener('click', () => callbacks.onSearch())
    this.el.querySelector('.new-btn')?.addEventListener('click', () => callbacks.onNewNote())
    this.el.querySelector('.help-btn')?.addEventListener('click', () => callbacks.onHelp())
    this.themeBtn.addEventListener('click', () => callbacks.onThemeToggle())
  }

  mount(parent: HTMLElement) {
    parent.appendChild(this.el)
  }

  setTheme(theme: 'dark' | 'light') {
    this.themeBtn.textContent = theme === 'dark' ? '☀' : '☾'
    this.themeBtn.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
  }

  setSyncStatus(status: SyncStatus, detail?: string) {
    this.syncEl.dataset.status = status
    const labels: Record<SyncStatus, string> = {
      idle: 'Ready',
      saving: 'Saving…',
      saved: 'Saved',
      offline: 'Offline — queued',
      error: 'Error'
    }
    this.syncEl.textContent = labels[status]
    if (detail) this.syncEl.title = detail
    else this.syncEl.removeAttribute('title')
  }

  setUser(auth: AuthState | null) {
    if (!auth) {
      this.userEl.innerHTML = `<button class="toolbar-btn signin-btn">Sign in with Google</button>`
      this.userEl.querySelector('.signin-btn')?.addEventListener('click', () => this.callbacks.onSignIn())
      return
    }
    const { name, picture } = auth.userInfo
    const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
    this.userEl.innerHTML = `
      <div class="user-menu">
        ${picture ? `<img src="${picture}" alt="${escapeAttr(name)}" class="user-avatar" referrerpolicy="no-referrer" />`
                  : `<div class="user-avatar user-avatar-initials">${initials}</div>`}
        <button class="toolbar-btn signout-btn" title="Sign out — ${escapeAttr(name)}">Sign out</button>
      </div>
    `
    this.userEl.querySelector('.signout-btn')?.addEventListener('click', () => this.callbacks.onSignOut())
  }
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
