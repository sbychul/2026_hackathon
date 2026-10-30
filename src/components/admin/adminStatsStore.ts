import { getCurrentUser, type CurrentUser } from '../../api/auth'
import { getAdminStats, type AdminStats } from '../../api/stats'

export type AdminState =
  | { status: 'loading' | 'error' | 'denied'; stats: null }
  | { status: 'ready'; stats: AdminStats }

interface Dependencies {
  currentUser: () => Promise<CurrentUser | null>
  stats: () => Promise<AdminStats>
}

// 권한 확인과 통계 조회를 한 요청으로 묶고 늦게 도착한 이전 응답을 버린다.
export function createAdminStatsStore(dependencies: Dependencies = { currentUser: getCurrentUser, stats: getAdminStats }) {
  let state: AdminState = { status: 'loading', stats: null }
  let revision = 0
  let pending = false
  const listeners = new Set<() => void>()

  // 화면에 공개할 상태만 보관하고 변경을 알린다.
  const publish = (next: AdminState) => {
    state = next
    listeners.forEach((listener) => listener())
  }

  // 재조회마다 서버의 현재 역할을 확인한다. 뒤에서 하는 재조회는 표시 중인 통계를 응답이 올 때까지 유지한다.
  const reload = async (background = false) => {
    if (pending) return
    pending = true
    const request = ++revision
    if (!background || state.status !== 'ready') publish({ status: 'loading', stats: null })
    try {
      const user = await dependencies.currentUser()
      if (request !== revision) return
      if (user?.role !== 'admin') {
        publish({ status: 'denied', stats: null })
        return
      }
      const stats = await dependencies.stats()
      if (request === revision) publish({ status: 'ready', stats })
    } catch {
      // 서버 오류 본문이나 요청 내용은 화면과 로그에 노출하지 않는다.
      if (request === revision) publish({ status: 'error', stats: null })
    } finally {
      if (request === revision) pending = false
    }
  }

  // 로그아웃·화면 종료 시 진행 중인 요청을 무효화하고 통계를 지운다.
  const clear = () => {
    revision++
    pending = false
    publish({ status: 'loading', stats: null })
  }

  return {
    reload,
    clear,
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
