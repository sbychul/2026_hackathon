import { RULES, type RuleId } from '../rules/rules'
import { getCurrentUser } from './auth'

export interface UserRuleCounts {
  userId: string
  name: string
  total: number
  counts: Record<RuleId, number>
}

export interface AdminStats {
  ranking: { rank: number; userId: string; name: string; total: number }[]
  userRuleCounts: UserRuleCounts[]
  ruleTotals: { ruleId: RuleId; name: string; count: number }[]
}

interface ProfileRow {
  id: string
  name: string
}

interface DetectionRow {
  user_id: string
  rule_id: string
  count: number
}

// 모든 룰의 건수를 0으로 초기화하여 탐지되지 않은 룰도 표에 표시한다.
function emptyCounts(): Record<RuleId, number> {
  return Object.fromEntries(RULES.map((rule) => [rule.id, 0])) as Record<RuleId, number>
}

// 사용자와 룰별 기록을 순위, 교차표, 전체 합계로 집계한다.
function aggregateStats(profiles: ProfileRow[], detections: DetectionRow[]): AdminStats {
  const users = new Map<string, UserRuleCounts>(profiles.map((profile) => [
    profile.id,
    { userId: profile.id, name: profile.name, total: 0, counts: emptyCounts() },
  ]))
  const totals = emptyCounts()
  for (const detection of detections) {
    const user = users.get(detection.user_id)
    const rule = RULES.find((item) => item.id === detection.rule_id)
    if (!user || !rule) throw new Error('통계의 사용자 또는 룰 정보를 확인할 수 없습니다.')
    user.total += detection.count
    user.counts[rule.id] += detection.count
    totals[rule.id] += detection.count
  }
  const userRuleCounts = [...users.values()].sort((a, b) =>
    b.total - a.total || a.userId.localeCompare(b.userId),
  )
  let rank = 0
  const ranking = userRuleCounts.map((user, index) => {
    if (index === 0 || user.total !== userRuleCounts[index - 1].total) rank = index + 1
    return { rank, userId: user.userId, name: user.name, total: user.total }
  })
  return {
    ranking,
    userRuleCounts,
    ruleTotals: RULES.map((rule) => ({ ruleId: rule.id, name: rule.name, count: totals[rule.id] })),
  }
}

// 관리자만 전체 기록을 조회하여 세 가지 대시보드 통계를 반환한다.
export async function getAdminStats(): Promise<AdminStats> {
  const user = await getCurrentUser()
  if (!user || user.role !== 'admin') throw new Error('관리자 권한이 필요합니다.')
  const { supabase } = await import('../lib/supabase')
  const profiles: ProfileRow[] = []
  const detections: DetectionRow[] = []
  // 서버의 응답 행 제한보다 기록이 많아도 마지막 빈 페이지까지 읽는다.
  const pageSize = 1000
  let offset = 0
  while (true) {
    const { data, error } = await supabase.from('profiles')
      .select('id, name').order('id').range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    profiles.push(...data)
    offset += data.length
  }
  offset = 0
  while (true) {
    const { data, error } = await supabase.from('detections')
      .select('user_id, rule_id, count').order('id').range(offset, offset + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    detections.push(...data)
    offset += data.length
  }
  return aggregateStats(profiles, detections)
}

// 연결 설정 없이도 실제 조회와 같은 형태의 가짜 대시보드 통계를 반환한다.
export async function getMockAdminStats(): Promise<AdminStats> {
  const profiles = [
    { id: 'demo-1', name: '가상 직원 가' },
    { id: 'demo-2', name: '가상 직원 나' },
    { id: 'demo-3', name: '가상 직원 다' },
    { id: 'demo-4', name: '가상 직원 라' },
    { id: 'demo-5', name: '가상 직원 마' },
  ]
  return aggregateStats(profiles, [
    { user_id: 'demo-1', rule_id: 'rrn', count: 8 },
    { user_id: 'demo-1', rule_id: 'phone', count: 12 },
    { user_id: 'demo-2', rule_id: 'email', count: 15 },
    { user_id: 'demo-2', rule_id: 'card', count: 5 },
    { user_id: 'demo-3', rule_id: 'name', count: 7 },
    { user_id: 'demo-3', rule_id: 'address', count: 3 },
    { user_id: 'demo-4', rule_id: 'phone', count: 2 },
  ])
}
