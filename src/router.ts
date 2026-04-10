export type RouteHandler = (params: Record<string, string>, query: URLSearchParams) => void | Promise<void>

interface Route {
  pattern: RegExp
  handler: RouteHandler
}

export class Router {
  private routes: Route[] = []
  private notFound: RouteHandler = () => {}
  private started = false

  on(pattern: RegExp, handler: RouteHandler): this {
    this.routes.push({ pattern, handler })
    return this
  }

  setNotFound(handler: RouteHandler): this {
    this.notFound = handler
    return this
  }

  start() {
    if (!this.started) {
      window.addEventListener('hashchange', () => this.dispatch())
      this.started = true
    }
    this.dispatch()
  }

  navigate(path: string, replace = false) {
    const target = path.startsWith('#') ? path : `#${path}`
    if (replace) {
      const url = location.href.split('#')[0] + target
      history.replaceState(null, '', url)
      this.dispatch()
    } else {
      location.hash = target.slice(1)
    }
  }

  current(): string {
    return location.hash.slice(1) || '/'
  }

  private dispatch() {
    const raw = this.current()
    const [path, queryString] = raw.split('?')
    const query = new URLSearchParams(queryString ?? '')
    for (const route of this.routes) {
      const match = path.match(route.pattern)
      if (match) {
        void route.handler(match.groups ?? {}, query)
        return
      }
    }
    void this.notFound({}, query)
  }
}

export const router = new Router()
