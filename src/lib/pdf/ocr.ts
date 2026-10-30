import { getDocument, GlobalWorkerOptions, OPS, type PDFDocumentProxy } from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { BrowserOcr } from '../ocr/client'
import { privacyRegions, type RuleCounts } from '../ocr/privacy-regions'
import type { OcrLine, OcrProgress } from '../ocr/types'
import type { PdfMaskRegion } from './export'
import { hasPageImages, nativeTextLines, rotatedPageBox } from '../ocr/pdf-page'
import { maskedPreview } from '../ocr/preview'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

export interface ScannedPdfResult {
  source: PDFDocumentProxy
  regions: PdfMaskRegion[]
  count: number
  counts: RuleCounts
  ocrPages: number
  directPages: number
  pages: Array<{ pageNumber: number; imageWidth: number; imageHeight: number; lines: OcrLine[]; preview?: string; method: 'ocr' | 'text'; elapsedMs: number; warning?: string }>
}
export interface ScanOptions {
  signal?: AbortSignal
  onProgress?: (pageNumber: number, pageCount: number, progress: OcrProgress) => void
}

// 취소된 문서는 더 진행하거나 완성된 결과로 반환하지 않는다.
function checkAbort(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('작업을 취소했습니다.')
}

// 스캔 페이지를 브라우저 안에서 읽고 개인정보 영역과 가린 미리보기를 반환한다.
export async function scanPdfPrivacy(file: Blob, options: ScanOptions = {}): Promise<ScannedPdfResult> {
  if (file.size > 30 * 1024 * 1024) throw new Error('첫 시연은 30메가바이트 이하 문서만 지원합니다.')
  checkAbort(options.signal)
  const data = new Uint8Array(await file.arrayBuffer())
  const task = getDocument({ data })
  // 문서를 여는 중의 취소도 읽기 작업을 중단한다.
  const cancelLoading = () => { void task.destroy() }
  options.signal?.addEventListener('abort', cancelLoading, { once: true })
  let source: PDFDocumentProxy | undefined
  const ocr = new BrowserOcr()
  try {
    source = await task.promise
    options.signal?.removeEventListener('abort', cancelLoading)
    checkAbort(options.signal)
    if (source.numPages > 100) throw new Error('현재 검증 화면은 100쪽 이하 문서만 지원합니다.')
    const regions: PdfMaskRegion[] = [], pages: ScannedPdfResult['pages'] = []
    const counts: RuleCounts = {}
    // 각 페이지의 규칙별 건수를 문서 합계에 더한다.
    const addCounts = (pageCounts: RuleCounts) => { for (const rule of Object.keys(pageCounts) as Array<keyof RuleCounts>) counts[rule]=(counts[rule]??0)+(pageCounts[rule]??0) }
    let count = 0, ocrPages = 0, directPages = 0, previews = 0
    for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
      checkAbort(options.signal)
      const page = await source.getPage(pageNumber)
      const started = performance.now()
      options.onProgress?.(pageNumber,source.numPages,{stage:'inspect',completed:0,total:1})
      const base = page.getViewport({ scale: 1 })
      const operators = await page.getOperatorList()
      checkAbort(options.signal)
      if (!hasPageImages(operators.fnArray, OPS)) {
        try {
          options.onProgress?.(pageNumber,source.numPages,{stage:'text',completed:0,total:1})
          const lines = nativeTextLines(await page.getTextContent(),base)
          checkAbort(options.signal)
          const detected = privacyRegions(lines,pageNumber,base.width,base.height,base.width,base.height)
          regions.push(...detected.regions); count += detected.count; addCounts(detected.counts); directPages++
          pages.push({pageNumber,imageWidth:base.width,imageHeight:base.height,lines,method:'text',elapsedMs:performance.now()-started,
            warning: !lines.length && operators.fnArray.length ? '읽을 수 있는 글자가 없습니다. 도형으로 그린 글자 등이 있는지 확인해 주세요.' : undefined})
        } finally { page.cleanup() }
        continue
      }
      const scale = Math.min(3, 2400 / Math.max(base.width, base.height))
      const renderBase = page.getViewport({ scale:1,rotation:0 })
      const viewport = page.getViewport({ scale,rotation:0 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      if (canvas.width < 1 || canvas.height < 1 || canvas.width * canvas.height > 6_000_000) throw new Error('문서 페이지 크기가 올바르지 않습니다.')
      const context = canvas.getContext('2d')
      if (!context) throw new Error('문서 이미지를 그릴 수 없습니다.')
      try {
        const render = page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' })
        // 페이지를 그리는 중에도 취소 요청을 반영한다.
        const cancelRender = () => render.cancel()
        options.signal?.addEventListener('abort', cancelRender, { once: true })
        try { await render.promise } finally { options.signal?.removeEventListener('abort', cancelRender) }
        checkAbort(options.signal)
        const bitmap = await createImageBitmap(canvas)
        const lines = await ocr.recognize(bitmap, options.signal, progress => options.onProgress?.(pageNumber, source!.numPages, progress))
        const detected = privacyRegions(lines, pageNumber, canvas.width, canvas.height, renderBase.width, renderBase.height)
        const outputRegions = base.rotation === renderBase.rotation ? detected.regions
          : detected.regions.map(region=>({pageNumber,...rotatedPageBox(region,renderBase,base)}))
        regions.push(...outputRegions); count += detected.count; addCounts(detected.counts)
        context.fillStyle = '#000000'
        for (const region of detected.regions) {
          const left = Math.max(0, Math.floor(region.x / renderBase.width * canvas.width))
          const top = Math.max(0, Math.floor(region.y / renderBase.height * canvas.height))
          const right = Math.min(canvas.width, Math.ceil((region.x + region.width) / renderBase.width * canvas.width))
          const bottom = Math.min(canvas.height, Math.ceil((region.y + region.height) / renderBase.height * canvas.height))
          context.fillRect(left, top, right - left, bottom - top)
        }
        // 긴 문서의 모든 미리보기를 메모리에 쌓지 않고 첫 이미지 페이지 두 장만 보관한다.
        const preview = previews < 2 ? maskedPreview(canvas,base.rotation-renderBase.rotation) : undefined
        if (preview) previews++
        ocrPages++
        pages.push({ pageNumber, imageWidth: canvas.width, imageHeight: canvas.height, lines, preview, method:'ocr',elapsedMs:performance.now()-started })
      } finally { canvas.width = 0; canvas.height = 0; page.cleanup() }
    }
    checkAbort(options.signal)
    return { source, regions, count, counts, pages, ocrPages, directPages }
  } catch (error) {
    await task.destroy()
    throw error
  } finally {
    options.signal?.removeEventListener('abort', cancelLoading)
    ocr.dispose()
  }
}
