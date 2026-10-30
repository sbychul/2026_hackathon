import type { UserRole } from '../../api/auth'
import type { RuleId } from '../../rules/rules'

export type MaskingMode = 'personal' | 'company'

// 관리자가 고정을 해제한 룰. 기업 사용자는 이 룰의 항목만 직접 해제할 수 있다.
// ponytail: 모듈 전역 상태라 결과 화면 전에 applyRuleLocks로 넣어야 한다. 공통 단어처럼 화면 전환 때 갱신한다.
let unlockedRules: ReadonlySet<RuleId> = new Set()

// 고정 해제된 룰 목록을 바꾼다. 공통 단어는 항상 고정이라 넣어도 무시한다.
export function setUnlockedRules(ids: readonly RuleId[]) {
  unlockedRules = new Set(ids.filter((id) => id !== 'custom'))
}

// 확인된 직원과 관리자 역할을 같은 기업 가림 모드로 바꾼다.
export function getMaskingMode(role: UserRole | 'personal'): MaskingMode {
  return role === 'employee' || role === 'admin' ? 'company' : 'personal'
}

// 기업 모드에서 해제할 수 없는 룰인지 확인한다. 개인 모드는 모두 해제할 수 있다.
export function isRuleLocked(ruleId: RuleId, mode: MaskingMode): boolean {
  return mode === 'company' && !unlockedRules.has(ruleId)
}

// 고정된 룰은 과거 선택 해제 상태와 관계없이 가리고, 나머지는 선택한 항목만 반환한다.
export function selectAutomaticMatches<T extends { ruleId: RuleId }>(
  matches: readonly T[],
  excluded: ReadonlySet<number>,
  mode: MaskingMode,
): T[] {
  return matches.filter((match, index) => isRuleLocked(match.ruleId, mode) || !excluded.has(index))
}
