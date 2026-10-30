import type { AdminStats } from '../../api/stats'

const number = new Intl.NumberFormat('ko-KR')

// 같은 조회 응답으로 요약, 순위, 그래프와 교차표를 함께 표시한다.
export default function AdminStatsContent({ stats }: { stats: AdminStats }) {
  const total = stats.ruleTotals.reduce((sum, rule) => sum + rule.count, 0)
  const max = Math.max(1, ...stats.ruleTotals.map((rule) => rule.count))

  return (
    <>
      <div className="admin-summary" aria-label="전체 통계 요약">
        <div className="admin-panel"><strong>{number.format(total)}건</strong><p className="admin-summary-desktop">전체 탐지 건수</p><p className="admin-summary-mobile">{number.format(stats.userRuleCounts.length)}명 · {stats.ruleTotals.length}종류의 전체 탐지 건수</p></div>
        <div className="admin-panel"><strong>{number.format(stats.userRuleCounts.length)}명</strong><p>관리자를 포함한 전체 사용자</p></div>
        <div className="admin-panel"><strong>{stats.ruleTotals.length}종류</strong><p>공통 탐지 규칙</p></div>
      </div>
      {total === 0 && <div className="admin-panel admin-empty" role="status"><h2>아직 탐지 기록이 없어요</h2><p>기업 사용자가 마스킹을 완료한 뒤 다시 조회해 주세요. 기록 없는 사용자와 규칙은 0건으로 표시해요.</p></div>}
      <div className="admin-overview">
        <section className="admin-panel" aria-labelledby="admin-ranking-title">
          <h2 id="admin-ranking-title">사람별 탐지 건수</h2>
          <p>같은 건수는 같은 순위예요.</p>
          <ol className="admin-ranking">
            {stats.ranking.map((user) => <li key={user.userId}>
              <span className="admin-rank"><span className="admin-sr-only">순위 </span>{user.rank}</span>
              <span>{user.name}</span><strong>{number.format(user.total)}건</strong>
            </li>)}
          </ol>
          {stats.ranking.length === 0 && <p>표시할 사용자가 없어요.</p>}
        </section>
        <section className="admin-panel" aria-labelledby="admin-chart-title">
          <h2 id="admin-chart-title">규칙별 전체 합계</h2>
          <p>0건 규칙도 표시해요. 숫자로도 확인할 수 있어요.</p>
          <ul className="admin-chart">
            {stats.ruleTotals.map((rule) => <li key={rule.ruleId}>
              <span>{rule.name}</span>
              <div className="admin-track" aria-hidden="true"><div style={{ width: `${rule.count / max * 100}%` }} /></div>
              <strong>{number.format(rule.count)}건</strong>
            </li>)}
          </ul>
        </section>
      </div>
      <section className="admin-panel" aria-labelledby="admin-table-title">
        <h2 id="admin-table-title">사람별 · 규칙별 탐지 건수</h2>
        <p className="admin-table-description">전체 건수 내림차순 · 동점 다음 순위는 건너뛰어요. 기록이 없으면 0건이에요.</p>
        <div className="admin-table-wrap" tabIndex={0} role="region" aria-label="사람별 규칙별 탐지 건수 표">
          <table className="admin-table">
            <caption className="admin-sr-only">사람별 규칙의 탐지 건수와 합계</caption>
            <thead><tr><th scope="col">사용자 이름</th>{stats.ruleTotals.map((rule) => <th key={rule.ruleId} scope="col">{rule.name}</th>)}<th scope="col">합계</th></tr></thead>
            <tbody>{stats.userRuleCounts.map((user) => <tr key={user.userId}><th scope="row">{user.name}</th>{stats.ruleTotals.map((rule) => <td key={rule.ruleId}>{number.format(user.counts[rule.ruleId])}</td>)}<td>{number.format(user.total)}</td></tr>)}</tbody>
            <tfoot><tr><th scope="row">합계</th>{stats.ruleTotals.map((rule) => <td key={rule.ruleId}>{number.format(rule.count)}</td>)}<td>{number.format(total)}</td></tr></tfoot>
          </table>
        </div>
        <div className="admin-user-details">
          <p>좁은 화면에서는 사람별로 펼쳐 읽어요.</p>
          {stats.userRuleCounts.map((user, index) => <details key={user.userId} open={index === 0}>
            <summary>{user.name} · {number.format(user.total)}건</summary>
            <dl>{stats.ruleTotals.map((rule) => <div key={rule.ruleId}><dt>{rule.name}</dt><dd>{number.format(user.counts[rule.ruleId])}건</dd></div>)}</dl>
          </details>)}
          {stats.userRuleCounts.length === 0 && <p>표시할 사용자가 없어요.</p>}
        </div>
      </section>
    </>
  )
}
