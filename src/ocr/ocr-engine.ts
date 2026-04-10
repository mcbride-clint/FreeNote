let tesseractPromise: Promise<typeof import('tesseract.js')> | null = null

async function loadTesseract() {
  if (!tesseractPromise) tesseractPromise = import('tesseract.js')
  return tesseractPromise
}

export type OcrProgress = (pct: number, status: string) => void

export class OcrEngine {
  async extractFromImage(file: File | Blob, onProgress?: OcrProgress): Promise<string> {
    const Tesseract = await loadTesseract()
    const { data } = await Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100), m.status)
        } else if (onProgress) {
          onProgress(Math.round(m.progress * 100), m.status)
        }
      }
    })
    return data.text
  }

  async extractFromCanvas(canvas: HTMLCanvasElement, onProgress?: OcrProgress): Promise<string> {
    const Tesseract = await loadTesseract()
    const { data } = await Tesseract.recognize(canvas, 'eng', {
      logger: (m) => {
        if (onProgress) onProgress(Math.round(m.progress * 100), m.status)
      }
    })
    return data.text
  }
}

export const ocrEngine = new OcrEngine()
