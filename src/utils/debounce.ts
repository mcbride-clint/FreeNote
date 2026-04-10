export function debounce<T extends (...args: any[]) => void>(fn: T, wait: number): T & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null
  const wrapped = ((...args: Parameters<T>) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, wait)
  }) as T & { cancel: () => void }
  wrapped.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }
  return wrapped
}
