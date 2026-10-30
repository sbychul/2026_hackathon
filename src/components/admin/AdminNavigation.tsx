import { useEffect, useState, type ReactNode } from 'react'
import { getCurrentUser, type CurrentUser } from '../../api/auth'
import Button from '../Button'

interface Props {
  onAdmin: () => void
  onMasking: () => void
  isAdminPage: boolean
  fallback: ReactNode
}

// 인증 서버에서 확인된 관리자에게만 통계 진입 메뉴를 제공한다.
export default function AdminNavigation({ onAdmin, onMasking, isAdminPage, fallback }: Props) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  useEffect(() => {
    let active = true
    let revision = 0
    let unsubscribe: (() => void) | undefined
    // 계정 변경이나 창 복귀 시 저장된 메뉴 권한을 다시 확인한다.
    const refresh = async () => {
      const request = ++revision
      setUser(null)
      try {
        const next = await getCurrentUser()
        if (active && request === revision) setUser(next)
      } catch { /* 확인할 수 없는 권한으로 메뉴를 열지 않는다. */ }
    }
    void refresh()
    void import('../../lib/supabase').then(({ supabase }) => {
      if (!active) return
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return
        revision++
        setUser(null)
        queueMicrotask(() => { if (active) void refresh() })
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }).catch(() => { /* 연결이 없으면 관리자 진입을 제공하지 않는다. */ })
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      revision++
      unsubscribe?.()
      window.removeEventListener('focus', refresh)
    }
  }, [])

  if (user?.role !== 'admin') return fallback
  return <nav className="mode" aria-label="관리자 화면">
    <span className="mode-label">기업 모드 · {user.name}</span>
    <Button variant="text" onClick={isAdminPage ? onMasking : onAdmin}>
      {isAdminPage ? '마스킹으로 돌아가기' : '관리자 통계'}
    </Button>
  </nav>
}
