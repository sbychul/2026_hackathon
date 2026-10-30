import type { UserRole } from '../../api/auth'

export type MaskingMode = 'personal' | 'company'

// 확인된 직원과 관리자 역할을 같은 기업 가림 모드로 바꾼다.
export function getMaskingMode(role: UserRole | 'personal'): MaskingMode {
  return role === 'employee' || role === 'admin' ? 'company' : 'personal'
}

// 기업에서는 과거 선택 해제 상태와 관계없이 자동 탐지 항목을 모두 반환한다.
export function selectAutomaticMatches<T>(
  matches: readonly T[],
  excluded: ReadonlySet<number>,
  mode: MaskingMode,
): T[] {
  return matches.filter((_, index) => mode === 'company' || !excluded.has(index))
}
