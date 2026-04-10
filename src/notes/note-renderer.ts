import { Marked } from 'marked'
import hljs from 'highlight.js'
import { resolveLink } from './note-linker'
import { parseFrontMatter } from '../utils/markdown-utils'

const marked = new Marked()
marked.setOptions({ breaks: true, gfm: true })

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      let highlighted: string
      try {
        highlighted = lang && hljs.getLanguage(lang)
          ? hljs.highlight(text, { language: lang }).value
          : hljs.highlightAuto(text).value
      } catch {
        highlighted = escapeHtml(text)
      }
      return `<pre><code class="hljs language-${lang ?? ''}">${highlighted}</code></pre>`
    }
  }
})

export function renderMarkdown(content: string): string {
  const { body } = parseFrontMatter(content)
  const html = marked.parse(body) as string
  return applyWikiLinks(html)
}

function applyWikiLinks(html: string): string {
  return html.replace(/\[\[([^\]]+)\]\]/g, (_match, name: string) => {
    const trimmed = name.trim()
    const { exists, href } = resolveLink(trimmed)
    const cls = exists ? 'wiki-link' : 'wiki-link wiki-link-new'
    return `<a class="${cls}" href="${href}" data-wiki="${escapeAttr(trimmed)}">${escapeHtml(trimmed)}</a>`
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;')
}
