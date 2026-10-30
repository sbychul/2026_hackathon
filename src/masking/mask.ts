import type { Match } from './detect'

export const MASK_CHAR = '*'

// 선택한 구간의 글자를 가림 문자로 바꾼 새 문자열을 반환한다. 원문은 바꾸지 않는다.
export function mask(text: string, matches: Match[]): string {
  let out = ''
  let cursor = 0
  for (const m of [...matches].sort((a, b) => a.start - b.start)) {
    if (m.start < cursor) continue
    out += text.slice(cursor, m.start) + MASK_CHAR.repeat(m.end - m.start)
    cursor = m.end
  }
  return out + text.slice(cursor)
}
