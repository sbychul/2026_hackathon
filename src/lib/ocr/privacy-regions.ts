import { detect } from '../../masking/detect'
import { RULES, type RuleId } from '../../rules/rules'
import { pageBox } from './geometry'
import type { OcrLine } from './types'
import type { PdfMaskRegion } from '../pdf/export'
import type { PdfMatch } from '../pdf/result'

export type RuleCounts = Partial<Record<RuleId, number>>
const phoneRules=RULES.filter(rule=>rule.id==='phone')

// 가까운 숫자와 구분자 조각만 이어 붙여 번호 내부에 인위적인 공백이 생기지 않게 한다.
function fragmentSeparator(previous: OcrLine, current: OcrLine, joinDigits: boolean): string {
  const gap=current.box.x-previous.box.x-previous.box.width
  const height=Math.min(previous.box.height,current.box.height)
  const left=previous.text.trim(), right=current.text.trim()
  // 일반 공백은 전화번호 구분자로도 쓰이므로 먼 숫자 조각 사이에는 탐지 불가 경계를 둔다.
  if (gap>height && /[\d.-]$/.test(left) && /^[\d.-]/.test(right)) return '\u0000'
  const splitSeparator=/(?:\d[-.]|^[-.])$/.test(left)&&/^\d/.test(right)
    || /\d$/.test(left)&&/^[-.](?:\d|$)/.test(right)
  const splitDigits=joinDigits&&gap<=height*.3&&/\d$/.test(left)&&/^\d/.test(right)
  return (gap<=height&&splitSeparator)||splitDigits?'':' '
}

// 같은 줄의 조각을 왼쪽부터 정렬하고 줄 사이에는 개행을 넣어 원래 영역과 대응시킨다.
function pageText(lines: OcrLine[], joinDigits=false) {
  const rows: OcrLine[][] = []
  for (const line of [...lines].sort((a,b)=>a.box.y-b.box.y || a.box.x-b.box.x)) {
    const row=rows.find(row=>Math.abs(row[0].box.y+row[0].box.height/2-line.box.y-line.box.height/2)<Math.min(row[0].box.height,line.box.height)*.5)
    if (row) row.push(line)
    else rows.push([line])
  }
  let text=''
  let sourceStart=0
  const spans:Array<{start:number;end:number;sourceStart:number;line:OcrLine}>=[]
  for (const row of rows) {
    for (const [index,line] of row.sort((a,b)=>a.box.x-b.box.x).entries()) {
      if (text) text+=index===0?'\n':fragmentSeparator(row[index-1],line,joinDigits)
      const start=text.length
      text+=line.text.trim()
      spans.push({start,end:text.length,sourceStart,line})
      sourceStart+=line.text.trim().length+1
    }
  }
  return {text,spans}
}

// 공통 규칙 전체로 찾은 구간을 원래 글자 조각에 연결하며 해당 영역을 중복 없이 가린다.
export function privacyRegions(lines: OcrLine[], pageNumber: number, imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number): { regions: PdfMaskRegion[]; count: number; counts: RuleCounts; matches: PdfMatch[] } {
  const normal=pageText(lines), joined=pageText(lines,true)
  const counts:RuleCounts={}
  const selected=new Set<OcrLine>()
  const found:Array<{start:number;end:number}>=[]
  const matches: PdfMatch[] = []
  // 원래 공백의 카드·계좌 등 공통 규칙 결과를 유지하고, 숫자 결합은 전화번호 보완에만 쓴다.
  const views=[{...normal,rules:RULES}]
  if (joined.text!==normal.text) views.push({...joined,rules:phoneRules})
  for (const {text,spans,rules} of views) for (const match of detect(text,rules)) {
    const covered=spans.filter(span=>span.start<match.end&&span.end>match.start)
    const first=covered[0],last=covered[covered.length-1]
    if (!first||!last) continue
    const start=first.sourceStart+Math.max(0,match.start-first.start)
    const end=last.sourceStart+Math.min(last.end-last.start,match.end-last.start)
    // 두 문자열의 위치를 원래 조각 기준으로 환산해 중복 탐지와 중복 집계를 막는다.
    if (found.some(previous=>start<previous.end&&end>previous.start)) continue
    found.push({start,end})
    matches.push({ ...match, pageNumber, value: text.slice(match.start, match.end),
      regions: covered.map(({ line }) => ({ pageNumber, ...pageBox(line.box,imageWidth,imageHeight,pageWidth,pageHeight) })) })
    counts[match.ruleId]=(counts[match.ruleId]??0)+1
    for (const span of covered) selected.add(span.line)
  }
  return {count:found.length,counts,matches,regions:[...selected].map(line=>({pageNumber,...pageBox(line.box,imageWidth,imageHeight,pageWidth,pageHeight)}))}
}
