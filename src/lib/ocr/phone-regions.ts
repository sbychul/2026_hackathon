import { detect } from '../../masking/detect'
import { RULES } from '../../rules/rules'
import { pageBox } from './geometry'
import type { OcrLine } from './types'
import type { PdfMaskRegion } from '../pdf/export'

// 프로젝트의 전화번호 규칙에 걸린 인식 영역 전체를 페이지 좌표로 반환한다.
export function phoneRegions(lines: OcrLine[], pageNumber: number, imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number): { regions: PdfMaskRegion[]; count: number } {
  const rules = RULES.filter(rule => rule.id === 'phone')
  let count = 0
  const regions: PdfMaskRegion[] = []
  for (const line of lines) {
    const matches = detect(line.text, rules)
    if (!matches.length) continue
    count += matches.length
    regions.push({ pageNumber, ...pageBox(line.box, imageWidth, imageHeight, pageWidth, pageHeight) })
  }
  return { regions, count }
}
