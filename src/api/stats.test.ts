import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { id: string }

// 테이블별 행을 id 순서로 돌려주는 가짜 조회. 페이지를 읽을 때마다 onPage를 부른다.
const fake = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  onPage: (() => {}) as (table: string) => void,
}))

vi.mock('./auth', () => ({
  getCurrentUser: async () => ({ id: 'admin', email: null, name: '관리자', role: 'admin' }),
}))

vi.mock('../lib/supabase', () => {
  const from = (table: string) => {
    let afterId: string | null = null
    let size = Infinity
    let offset: [number, number] | null = null
    const query = {
      select: () => query,
      gt: (_column: string, value: string) => { afterId = value; return query },
      order: () => query,
      limit: (value: number) => { size = value; return query },
      range: (start: number, end: number) => { offset = [start, end]; return query },
      then: (resolve: (value: unknown) => void) => {
        const sorted = [...fake.tables[table]].sort((a, b) => (a.id < b.id ? -1 : 1))
        const data = offset
          ? sorted.slice(offset[0], offset[1] + 1)
          : sorted.filter((row) => afterId === null || row.id > afterId).slice(0, size)
        fake.onPage(table)
        resolve({ data, error: null })
      },
    }
    return query
  }
  return { supabase: { from } }
})

const { getAdminStats, getMockAdminStats } = await import('./stats')

// 0으로 시작하는 정렬용 id를 만든다.
const id = (n: number) => String(n).padStart(6, '0')

beforeEach(() => {
  fake.onPage = () => {}
  fake.tables = {
    profiles: [{ id: 'a', name: '가' }],
    detections: Array.from({ length: 1500 }, (_, i) => ({ id: id(i * 2 + 2), user_id: 'a', rule_id: 'rrn', count: 1 })),
  }
})

describe('관리자 통계', () => {
  it('계좌번호 기록을 사용자별 건수와 전체 합계에 포함한다', async () => {
    fake.tables.detections = [{ id: '1', user_id: 'a', rule_id: 'account', count: 2 }]
    const stats = await getAdminStats()
    expect(stats.userRuleCounts[0].counts.account).toBe(2)
    expect(stats.ranking[0].total).toBe(2)
    expect(stats.ruleTotals.find((rule) => rule.ruleId === 'account')?.count).toBe(2)
  })

  it('여러 페이지 조회 중 앞쪽에 기록이 추가되어도 중복 집계하지 않는다', async () => {
    let added = false
    fake.onPage = (table) => {
      if (table === 'detections' && !added) {
        added = true
        fake.tables.detections.push({ id: id(1), user_id: 'a', rule_id: 'rrn', count: 1 })
      }
    }
    const stats = await getAdminStats()
    expect(stats.ruleTotals.find((rule) => rule.ruleId === 'rrn')?.count).toBe(1500)
  })

  it('프로필이 사라진 사용자의 기록은 건너뛰고 통계를 반환한다', async () => {
    fake.tables.detections.push({ id: id(9_999_999), user_id: 'gone', rule_id: 'phone', count: 3 })
    const stats = await getAdminStats()
    expect(stats.ranking).toEqual([{ rank: 1, userId: 'a', name: '가', total: 1500 }])
  })
})

describe('가짜 통계', () => {
  it('동점은 같은 순위이고 다음 순위를 건너뛴다', async () => {
    const stats = await getMockAdminStats()
    expect(stats.ranking.map((row) => [row.userId, row.total, row.rank])).toEqual([
      ['demo-1', 20, 1], ['demo-2', 20, 1], ['demo-3', 10, 3], ['demo-4', 2, 4], ['demo-5', 0, 5],
    ])
    expect(stats.ruleTotals.map((rule) => [rule.ruleId, rule.count])).toEqual([
      ['rrn', 8], ['phone', 14], ['email', 15], ['card', 5], ['name', 7], ['address', 3], ['account', 0],
    ])
    expect(stats.userRuleCounts[4].counts).toEqual({ rrn: 0, phone: 0, email: 0, card: 0, name: 0, address: 0, account: 0 })
  })
})
