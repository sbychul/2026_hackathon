import { setUnlockedRules } from '../components/enterprise/maskingPolicy'
import type { RuleId } from '../rules/rules'

export interface RuleLock {
  id: RuleId
  locked: boolean
}

// 기본 탐지 룰별 고정 여부를 조회한다. 공통 단어는 항상 고정이라 제외한다.
export async function listRuleLocks(): Promise<RuleLock[]> {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.from('rules').select('id, locked').neq('id', 'custom')
  if (error) throw error
  return (data ?? []) as RuleLock[]
}

// 관리자 권한으로 룰의 고정 여부를 바꾼다. 권한이 없어 바뀌지 않으면 실패로 본다.
export async function setRuleLock(id: RuleId, locked: boolean): Promise<void> {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.from('rules').update({ locked }).eq('id', id).select('id')
  if (error || !data?.length) throw new Error('고정 설정을 저장하지 못했어요.')
}

// 기업 모드는 고정 해제된 룰을 가림 정책에 넣고, 개인 모드는 비운다.
export async function applyRuleLocks(company: boolean): Promise<void> {
  if (!company) return setUnlockedRules([])
  setUnlockedRules((await listRuleLocks()).filter((rule) => !rule.locked).map((rule) => rule.id))
}
