export const MASK_CHAR = '*'

// 가릴 구간. 자동 탐지 항목(Match)과 사용자가 직접 고른 구간을 함께 받는다.
export interface MaskRange {
  start: number
  end: number
}

// 선택한 구간의 글자를 가림 문자로 바꾼 새 문자열을 반환한다. 겹치는 구간도 빠짐없이 가린다.
export function mask(text: string, ranges: readonly MaskRange[]): string {
  let out = ''
  let cursor = 0
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    if (r.end <= cursor) continue
    const from = Math.max(r.start, cursor)
    out += text.slice(cursor, from) + MASK_CHAR.repeat(r.end - from)
    cursor = r.end
  }
  return out + text.slice(cursor)
}
