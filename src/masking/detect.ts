import { RULES, type Rule, type RuleId } from '../rules/rules'

// 탐지된 구간. 실제 값은 담지 않고 원문에서의 위치만 담는다. (end는 포함하지 않음)
export interface Match {
  ruleId: RuleId
  start: number
  end: number
}

// 텍스트에서 룰에 걸리는 구간을 찾아 앞에서부터 순서대로 반환한다.
export function detect(text: string, rules: Rule[] = RULES): Match[] {
  const found: Match[] = []
  for (const rule of rules) {
    for (const m of text.matchAll(rule.pattern)) {
      if (rule.validate && !rule.validate(m[0])) continue
      found.push({ ruleId: rule.id, start: m.index, end: m.index + m[0].length })
    }
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end)

  // 겹치는 구간은 먼저 시작한(같으면 더 긴) 것만 남긴다.
  const result: Match[] = []
  for (const m of found) {
    const last = result[result.length - 1]
    if (!last || m.start >= last.end) result.push(m)
  }
  return result
}
