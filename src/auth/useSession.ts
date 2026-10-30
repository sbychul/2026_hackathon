import { useEffect, useState, useSyncExternalStore } from 'react'
import { createSession } from './session'

// 인증 변경과 창 복귀 시 세션을 재검사하고 구독을 정리한다.
export function useSession() {
  const [session] = useState(createSession)
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot)

  useEffect(() => {
    let active = true
    let unsubscribe: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined

    // 진행 중인 로그인 요청을 덮지 않고 인증 콜백 밖에서 프로필을 조회한다.
    function scheduleRefresh() {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!active) return
        if (session.getSnapshot().pending) scheduleRefresh()
        else void session.refresh()
      }, 100)
    }

    // 로그인한 사용자가 창으로 돌아왔을 때만 서버 권한을 재확인한다.
    function checkOnFocus() {
      if (session.getSnapshot().user) scheduleRefresh()
    }

    void session.refresh()
    void import('../lib/supabase').then(({ supabase }) => {
      if (!active) return
      const { data } = supabase.auth.onAuthStateChange(event => {
        if (event !== 'INITIAL_SESSION') scheduleRefresh()
      })
      unsubscribe = () => data.subscription.unsubscribe()
    }).catch(() => { /* 연결 설정 오류는 현재 사용자 조회의 안내로 표시한다. */ })
    window.addEventListener('focus', checkOnFocus)
    return () => {
      active = false
      clearTimeout(timer)
      unsubscribe?.()
      window.removeEventListener('focus', checkOnFocus)
    }
  }, [session])

  return { ...state, signIn: session.signIn, signOut: session.signOut, refresh: session.refresh, clearError: session.clearError }
}
