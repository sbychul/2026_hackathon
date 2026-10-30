import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { getMockAdminStats } from '../../api/stats'
import AdminStatsContent from './AdminStatsContent'

describe('관리자 통계 표시', () => {
  it('가짜 통계의 동점·0건 사용자·7개 규칙과 합계를 표시한다', async () => {
    const stats = await getMockAdminStats()
    const html = renderToStaticMarkup(<AdminStatsContent stats={stats} />)
    expect(html).toContain('52건')
    expect(html).toContain('5명')
    expect(html).toContain('7종류')
    expect(html).toContain('가상 직원 마')
    expect(html).toContain('계좌번호')
    expect(html).toContain('width:0%')
    expect(html).not.toContain('NaN')
    expect(stats.ranking.map((row) => row.rank)).toEqual([1, 1, 3, 4, 5])
  })

  it('관리자 본인과 이름의 특수문자를 안전하게 표시한다', async () => {
    const stats = await getMockAdminStats()
    stats.ranking[0].name = '가상 관리자 <script>'
    stats.userRuleCounts[0].name = '가상 관리자 <script>'
    const html = renderToStaticMarkup(<AdminStatsContent stats={stats} />)
    expect(html).toContain('가상 관리자 &lt;script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('demo-1')
  })

  it('기록이 없어도 모든 사용자와 규칙을 0으로 표시한다', async () => {
    const stats = await getMockAdminStats()
    stats.ranking.forEach((row) => { row.total = 0; row.rank = 1 })
    stats.userRuleCounts.forEach((row) => {
      row.total = 0
      stats.ruleTotals.forEach((rule) => { row.counts[rule.ruleId] = 0 })
    })
    stats.ruleTotals.forEach((rule) => { rule.count = 0 })
    const html = renderToStaticMarkup(<AdminStatsContent stats={stats} />)
    expect(html).toContain('아직 탐지 기록이 없어요')
    expect(html).toContain('5명')
    expect(html).toContain('7종류')
    expect(html).not.toContain('NaN')
  })
})
