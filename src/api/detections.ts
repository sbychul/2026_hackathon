import { RULES, type RuleId } from '../rules/rules'
import { getCurrentUser } from './auth'

export type InputType = 'text' | 'pdf'

export interface SaveDetectionsInput {
  inputType: InputType
  counts: Partial<Record<RuleId, number>>
}

export interface SaveDetectionsResult {
  savedRows: number
}

// 마스킹 한 번의 룰별 양수 건수만 현재 사용자 소유의 기록으로 일괄 저장한다.
export async function saveDetections(input: SaveDetectionsInput): Promise<SaveDetectionsResult> {
  if (input.inputType !== 'text' && input.inputType !== 'pdf') {
    throw new Error('입력 방식은 텍스트 또는 PDF여야 합니다.')
  }
  const counts: { ruleId: RuleId; count: number }[] = []
  for (const [ruleId, count] of Object.entries(input.counts)) {
    const rule = RULES.find((item) => item.id === ruleId)
    if (!rule || !Number.isInteger(count) || count < 0 || count > 2_147_483_647) {
      throw new Error('등록된 룰과 0 이상의 정수 건수를 입력해야 합니다.')
    }
    if (count > 0) counts.push({ ruleId: rule.id, count })
  }

  const user = await getCurrentUser()
  // 개인 모드는 기록을 남기지 않는다.
  if (!user || counts.length === 0) return { savedRows: 0 }

  const rows = counts.map(({ ruleId, count }) => ({
    user_id: user.id,
    rule_id: ruleId,
    count,
    input_type: input.inputType,
  }))
  const { supabase } = await import('../lib/supabase')
  const { error } = await supabase.from('detections').insert(rows)
  if (error) throw error
  return { savedRows: rows.length }
}
