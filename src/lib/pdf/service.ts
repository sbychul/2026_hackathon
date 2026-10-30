import { extractPdf, type PdfText } from './extract'
import { detectPdf, type PdfMatch } from './result'
import { privacyRegions } from '../ocr/privacy-regions'
import { rotatedPageBox } from '../ocr/pdf-page'
import type { ScanOptions } from './ocr'

export interface ServicePdf {
  bytes: Uint8Array
  text: PdfText
  matches: PdfMatch[]
}

// 원래 글자 경로를 유지하고 이미지 페이지의 인식 결과를 같은 선택·저장 좌표로 연결한다.
export async function readServicePdf(file: File, options: ScanOptions = {}): Promise<ServicePdf> {
  if (file.size > 30 * 1024 * 1024) throw new Error('PDF는 30메가바이트 이하로 첨부해 주세요.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  const text = await extractPdf(bytes)
  if (options.signal?.aborted) throw new Error('작업을 취소했습니다.')
  const { scanPdfPrivacy } = await import('./ocr')
  const scanned = await scanPdfPrivacy(file, options)
  try {
    const matches: PdfMatch[] = []
    for (const page of scanned.pages) {
      if (options.signal?.aborted) throw new Error('작업을 취소했습니다.')
      if (page.warning || !page.lines.some(line => line.text.trim())) {
        throw new Error(`${page.pageNumber}쪽의 글자를 읽지 못했어요. 개인정보가 없다는 뜻은 아니에요. 문서 품질을 확인해 주세요.`)
      }
      if (page.method === 'text') {
        matches.push(...detectPdf(text.pages.filter(item => item.pageNumber === page.pageNumber)))
        continue
      }
      const sourcePage = await scanned.source.getPage(page.pageNumber)
      const base = sourcePage.getViewport({ scale: 1 })
      const upright = sourcePage.getViewport({ scale: 1, rotation: 0 })
      const detected = privacyRegions(page.lines, page.pageNumber, page.imageWidth, page.imageHeight, upright.width, upright.height)
      matches.push(...detected.matches.map(match => ({
        ...match,
        regions: base.rotation === upright.rotation ? match.regions : match.regions.map(region => ({
          pageNumber: page.pageNumber, ...rotatedPageBox(region, upright, base),
        })),
      })))
    }
    if (options.signal?.aborted) throw new Error('작업을 취소했습니다.')
    return { bytes, text, matches }
  } finally {
    await scanned.source.loadingTask.destroy()
  }
}
