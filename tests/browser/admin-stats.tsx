import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { getMockAdminStats, type AdminStats } from '../../src/api/stats'
import AdminStatsContent from '../../src/components/admin/AdminStatsContent'
import Button from '../../src/components/Button'
import '../../src/index.css'
import '../../src/pages/AdminPage.css'

// 개발 서버에서만 가짜 통계로 데스크톱·모바일 배치를 확인한다.
export default function Preview() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  useEffect(() => { void getMockAdminStats().then(setStats) }, [])
  return <main className="admin-page">
    <header className="admin-heading"><p className="admin-eyebrow">관리자 통계 · 검증용 가상 데이터</p><h1><span className="admin-title-desktop">보안 교육이 필요한 지점을 살펴봐요</span><span className="admin-title-mobile">보안 교육 통계</span></h1><p>탐지된 내용은 볼 수 없어요. 이름과 건수로 교육 주제를 확인해 주세요.</p></header>
    <div className="admin-toolbar"><p>전체 기간 · 텍스트와 문서 누적 / 가상 예시 데이터</p><Button onClick={() => { void getMockAdminStats().then(setStats) }}>다시 조회</Button></div>
    <div className="admin-data">{stats && <AdminStatsContent stats={stats} />}</div>
    <p className="admin-footnote">관리자도 원문·파일·실제 개인정보는 볼 수 없어요. 통계는 보안 교육을 위해 사용해 주세요.</p>
  </main>
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<Preview />)
