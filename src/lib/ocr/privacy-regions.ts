import { detect } from '../../masking/detect'
import { RULES, type RuleId } from '../../rules/rules'
import { pageBox } from './geometry'
import type { OcrLine } from './types'
import type { PdfMaskRegion } from '../pdf/export'

export type RuleCounts = Partial<Record<RuleId, number>>

// 같은 줄의 조각을 왼쪽부터 정렬하고 줄 사이에는 개행을 넣어 원래 영역과 대응시킨다.
function pageText(lines: OcrLine[]) {
  const rows: OcrLine[][] = []
  for (const line of [...lines].sort((a,b)=>a.box.y-b.box.y || a.box.x-b.box.x)) {
    const row=rows.find(row=>Math.abs(row[0].box.y+row[0].box.height/2-line.box.y-line.box.height/2)<Math.min(row[0].box.height,line.box.height)*.5)
    if (row) row.push(line)
    else rows.push([line])
  }
  let text=''
  const spans:Array<{start:number;end:number;line:OcrLine}>=[]
  for (const row of rows) {
    for (const [index,line] of row.sort((a,b)=>a.box.x-b.box.x).entries()) {
      if (text) text+=index===0?'\n':' '
      const start=text.length
      text+=line.text
      spans.push({start,end:text.length,line})
    }
  }
  return {text,spans}
}

// 공통 규칙 전체로 찾은 구간을 원래 글자 조각에 연결하며 해당 영역을 중복 없이 가린다.
export function privacyRegions(lines: OcrLine[], pageNumber: number, imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number): { regions: PdfMaskRegion[]; count: number; counts: RuleCounts } {
  const {text,spans}=pageText(lines)
  const matches=detect(text,RULES)
  const counts:RuleCounts={}
  const selected=new Set<OcrLine>()
  for (const match of matches) {
    counts[match.ruleId]=(counts[match.ruleId]??0)+1
    for (const span of spans) if (span.start<match.end && span.end>match.start) selected.add(span.line)
  }
  return {count:matches.length,counts,regions:[...selected].map(line=>({pageNumber,...pageBox(line.box,imageWidth,imageHeight,pageWidth,pageHeight)}))}
}
