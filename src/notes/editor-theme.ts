import { EditorView } from '@codemirror/view'

export const markflowTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text-primary)',
      backgroundColor: 'transparent',
      height: '100%',
      fontSize: '16px'
    },
    '.cm-scroller': {
      fontFamily: 'var(--font-body)',
      lineHeight: '1.7',
      padding: '24px 0'
    },
    '.cm-content': {
      caretColor: 'var(--accent)',
      maxWidth: '780px',
      margin: '0 auto',
      padding: '0 24px'
    },
    '.cm-line': {
      padding: '0'
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--accent)'
    },
    '.cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(212, 168, 67, 0.25)'
    },
    '&.cm-focused .cm-selectionBackground': {
      backgroundColor: 'rgba(212, 168, 67, 0.3)'
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      border: 'none'
    },
    '.cm-wiki-link': {
      color: 'var(--wiki-link)',
      textDecoration: 'underline',
      textDecorationColor: 'rgba(188, 140, 255, 0.4)',
      cursor: 'pointer'
    },
    '.cm-activeLine': {
      backgroundColor: 'rgba(255, 255, 255, 0.02)'
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent'
    }
  },
  { dark: true }
)
