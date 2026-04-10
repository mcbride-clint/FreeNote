export type ToastKind = 'info' | 'success' | 'error' | 'progress'

export interface ToastHandle {
  update(message: string, progress?: number): void
  dismiss(): void
}

class ToastContainer {
  private root: HTMLDivElement | null = null

  private ensureRoot(): HTMLDivElement {
    if (!this.root) {
      this.root = document.createElement('div')
      this.root.className = 'toast-container'
      document.body.appendChild(this.root)
    }
    return this.root
  }

  show(message: string, kind: ToastKind = 'info', duration = 3500): ToastHandle {
    const root = this.ensureRoot()
    const el = document.createElement('div')
    el.className = `toast toast-${kind}`
    const text = document.createElement('div')
    text.className = 'toast-text'
    text.textContent = message
    el.appendChild(text)

    let bar: HTMLDivElement | null = null
    if (kind === 'progress') {
      bar = document.createElement('div')
      bar.className = 'toast-progress'
      const fill = document.createElement('div')
      fill.className = 'toast-progress-fill'
      bar.appendChild(fill)
      el.appendChild(bar)
    }

    root.appendChild(el)
    requestAnimationFrame(() => el.classList.add('toast-visible'))

    let timer: ReturnType<typeof setTimeout> | null = null
    const dismiss = () => {
      if (timer) clearTimeout(timer)
      el.classList.remove('toast-visible')
      setTimeout(() => el.remove(), 250)
    }

    if (kind !== 'progress') {
      timer = setTimeout(dismiss, duration)
    }

    return {
      update(message: string, progress?: number) {
        text.textContent = message
        if (bar && typeof progress === 'number') {
          const fill = bar.firstElementChild as HTMLDivElement
          fill.style.width = `${Math.max(0, Math.min(100, progress))}%`
        }
      },
      dismiss
    }
  }
}

export const toast = new ToastContainer()
