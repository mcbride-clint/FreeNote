import type { Worker as TesseractWorker } from 'tesseract.js'

export type OcrProgress = (pct: number, status: string) => void

let workerPromise: Promise<TesseractWorker> | null = null
let currentLogger: OcrProgress | undefined

async function getWorker(): Promise<TesseractWorker> {
  if (!workerPromise) {
    workerPromise = import('tesseract.js').then(async ({ createWorker, OEM, PSM }) => {
      const worker = await createWorker('eng', OEM.LSTM_ONLY, {
        logger: (m: any) => {
          if (currentLogger) currentLogger(Math.round(m.progress * 100), m.status)
        }
      })
      await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO })
      return worker
    })
  }
  return workerPromise
}

function preprocessCanvas(source: HTMLCanvasElement | HTMLImageElement): HTMLCanvasElement {
  const srcW = 'naturalWidth' in source ? source.naturalWidth : source.width
  const srcH = 'naturalHeight' in source ? source.naturalHeight : source.height

  const minDim = 1500
  const scale = Math.max(srcW, srcH) < minDim ? minDim / Math.max(srcW, srcH) : 1

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(srcW * scale)
  canvas.height = Math.round(srcH * scale)
  const ctx = canvas.getContext('2d')!

  // Grayscale + contrast boost
  ctx.filter = 'grayscale(1) contrast(1.8)'
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height)
  ctx.filter = 'none'

  // Otsu binarization
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const data = imageData.data
  const hist = new Uint32Array(256)
  for (let i = 0; i < data.length; i += 4) hist[data[i]]++
  const total = canvas.width * canvas.height
  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]
  let sumB = 0, wB = 0, max = 0, threshold = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (!wB) continue
    const wF = total - wB
    if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sum - sumB) / wF
    const between = wB * wF * (mB - mF) ** 2
    if (between > max) { max = between; threshold = t }
  }
  for (let i = 0; i < data.length; i += 4) {
    const v = data[i] < threshold ? 0 : 255
    data[i] = data[i + 1] = data[i + 2] = v
  }
  ctx.putImageData(imageData, 0, 0)
  return canvas
}

async function fileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = reject
      el.src = url
    })
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d')!.drawImage(img, 0, 0)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export class OcrEngine {
  async extractFromImage(file: File | Blob, onProgress?: OcrProgress): Promise<string> {
    const worker = await getWorker()
    const raw = await fileToCanvas(file)
    const canvas = preprocessCanvas(raw)
    currentLogger = onProgress
    try {
      const { data } = await worker.recognize(canvas)
      return data.text
    } finally {
      currentLogger = undefined
    }
  }

  async extractFromCanvas(canvas: HTMLCanvasElement, onProgress?: OcrProgress): Promise<string> {
    const worker = await getWorker()
    const processed = preprocessCanvas(canvas)
    currentLogger = onProgress
    try {
      const { data } = await worker.recognize(processed)
      return data.text
    } finally {
      currentLogger = undefined
    }
  }
}

export const ocrEngine = new OcrEngine()
