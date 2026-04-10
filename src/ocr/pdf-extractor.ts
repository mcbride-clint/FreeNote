import type { PDFDocumentProxy } from 'pdfjs-dist'

let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null

async function loadPdfJs() {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.mjs`
      return lib
    })
  }
  return pdfjsLibPromise
}

export interface PdfExtractResult {
  text: string
  needsOcr: boolean
  pdf: PDFDocumentProxy
}

export async function extractPdfText(file: File | ArrayBuffer): Promise<PdfExtractResult> {
  const pdfjs = await loadPdfJs()
  const data = file instanceof File ? await file.arrayBuffer() : file
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(' ')
      .trim()
    pages.push(pageText)
  }
  const text = pages.join('\n\n---\n\n').trim()
  return { text, needsOcr: text.length < 20, pdf }
}

export async function renderPdfPageToCanvas(pdf: PDFDocumentProxy, pageNumber: number, scale = 2): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(pageNumber)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas context unavailable')
  await page.render({ canvasContext: context, viewport }).promise
  return canvas
}
