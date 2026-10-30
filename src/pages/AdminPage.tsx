import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Button from '../components/Button'
import AdminStatsContent from '../components/admin/AdminStatsContent'
import { createAdminStatsStore } from '../components/admin/adminStatsStore'
import './AdminPage.css'

// 관리자 권한을 확인한 뒤 실제 누적 통계와 조회 상태를 표시한다.
export default function AdminPage({ onBack }: { onBack: () => void }) {
  const [store] = useState(createAdminStatsStore)
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const statusHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    void store.reload()
    let active = true
    let unsubscribe: (() => void) | undefined
    // 다른 탭의 로그아웃과 계정 변경 시 이전 계정의 통계를 즉시 지운다.
    void import('../lib/supabase').then(({ supabase }) => {
      if (!active) return
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
        store.clear()
        // 인증 콜백 안에서 인증 API를 기다리지 않도록 다음 작업으로 넘긴다.
        queueMicrotask(() => { if (active) void store.reload() })
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }).catch(() => { /* 설정 실패는 통계 조회의 오류 화면에서 안내한다. */ })
    // 다른 탭에서 변경된 권한도 화면으로 돌아올 때 확인한다.
    const refresh = () => { void store.reload() }
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      unsubscribe?.()
      window.removeEventListener('focus', refresh)
      store.clear()
    }
  }, [store])

  const titleRef = useRef<HTMLHeadingElement>(null)

  // 통계 화면으로 바뀌면 초점을 제목으로 옮겨 키보드·화면 읽기 사용자가 위치를 잃지 않게 한다.
  useEffect(() => titleRef.current?.focus({ preventScroll: true }), [])

  useEffect(() => {
    if (state.status === 'error' || state.status === 'denied') statusHeading.current?.focus()
  }, [state.status])

  return (
    <main className="admin-page">
      <header className="admin-heading">
        <p className="admin-eyebrow">관리자 통계</p>
        <h1 ref={titleRef} tabIndex={-1}><span className="admin-title-desktop">보안 교육이 필요한 지점을 살펴봐요</span><span className="admin-title-mobile">보안 교육 통계</span></h1>
        <p>탐지된 내용은 볼 수 없어요. 이름과 건수로 교육 주제를 확인해 주세요.</p>
      </header>
      <div className="admin-toolbar">
        <p>전체 기간 · 텍스트와 문서 누적</p>
        <Button onClick={() => void store.reload()} disabled={state.status === 'loading'}>{state.status === 'loading' ? '조회 중이에요' : '다시 조회'}</Button>
      </div>
      <div className="admin-data" aria-busy={state.status === 'loading'}>
        {state.status === 'loading' && <section className="admin-panel" role="status"><h2>통계를 불러오고 있어요</h2><p>관리자 권한과 탐지 기록을 확인하고 있어요.</p></section>}
        {state.status === 'error' && <section className="admin-panel" role="alert"><h2 ref={statusHeading} tabIndex={-1}>통계를 불러오지 못했어요</h2><p>연결과 로그인 상태를 확인하고 다시 조회해 주세요. 조회 실패는 0건으로 표시하지 않아요.</p></section>}
        {state.status === 'denied' && <section className="admin-panel" role="alert"><h2 ref={statusHeading} tabIndex={-1}>관리자만 볼 수 있는 화면이에요</h2><p>관리자 계정으로 로그인한 뒤 이용해 주세요.</p><Button variant="secondary" onClick={onBack}>마스킹 화면으로 돌아가기</Button></section>}
        {state.status === 'ready' && <AdminStatsContent stats={state.stats} />}
      </div>
      <p className="admin-footnote">관리자도 원문·파일·실제 개인정보는 볼 수 없어요. 직접 가린 영역과 실행 횟수는 포함하지 않아요. 통계는 보안 교육을 위해 사용해 주세요.</p>
    </main>
  )
}
