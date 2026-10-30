import type { UserRole } from '../../api/auth'

export type MaskingRole = 'personal' | UserRole

// 직원과 관리자는 같은 기업 강제 가림 정책을 사용한다.
export function isEnterpriseRole(role: MaskingRole): boolean {
  return role === 'employee' || role === 'admin'
}

// 기업에서는 과거 선택 해제 상태와 관계없이 자동 탐지 항목을 모두 반환한다.
export function selectAutomaticMatches<T>(
  matches: readonly T[],
  excluded: ReadonlySet<number>,
  role: MaskingRole,
): T[] {
  return matches.filter((_, index) => isEnterpriseRole(role) || !excluded.has(index))
}
