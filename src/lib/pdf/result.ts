import { detect, type Match } from '../../masking/detect'
import { findRects, type PdfText } from './extract'
import type { PdfMaskRegion } from './export'

export interface PdfMatch extends Match {
  pageNumber: number
  value: string
  regions: PdfMaskRegion[]
}

// 페이지별 탐지 구간을 미리보기와 저장에 사용할 화면 좌표로 바꾼다.
export function detectPdf(pages: PdfText['pages']): PdfMatch[] {
  return pages.flatMap((page) => detect(page.text).map((match) => ({
    ...match,
    pageNumber: page.pageNumber,
    value: page.text.slice(match.start, match.end),
    regions: findRects(page, match.start, match.end).map((rect) => ({
      ...rect,
      pageNumber: page.pageNumber,
    })),
  })))
}
