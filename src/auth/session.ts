import * as auth from '../api/auth'
import type { CurrentUser, LoginInput } from '../api/auth'

export interface AuthState {
  user: CurrentUser | null
  pending: boolean
  error: string
  revision: number
}

// 인증 오류의 요청 내용 대신 사용자가 조치할 수 있는 안내만 반환한다.
export function loginError(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null
  if (code === 'invalid_credentials') return '이메일이나 비밀번호가 맞지 않아요. 다시 확인해 주세요.'
  if (code === 'email_not_confirmed') return '이메일 인증이 필요해요. 관리자에게 문의해 주세요.'
  return '로그인이나 프로필 확인을 완료하지 못했어요. 계정 정보와 연결 상태를 확인하고 다시 시도해 주세요.'
}

// 중복 요청과 늦게 도착한 응답을 막으며 인증 함수의 사용자 상태를 관리한다.
export function createSession(api = auth) {
  let state: AuthState = { user: null, pending: true, error: '', revision: 0 }
  let request = 0
  const listeners = new Set<() => void>()

  // 변경된 상태를 구독 중인 화면에 알린다.
  function update(next: Partial<AuthState>) {
    state = { ...state, ...next }
    listeners.forEach(listener => listener())
  }

  // 시작 시나 세션 변경 시 서버와 저장된 프로필을 다시 확인한다.
  async function refresh() {
    const current = ++request
    const previous = state.user
    update({ pending: true })
    try {
      const user = await api.getCurrentUser()
      if (current !== request) return
      const changed = user?.id !== previous?.id || user?.role !== previous?.role
      update({ user, pending: false, error: previous && !user
        ? '로그인이 만료됐어요. 기업 작업을 계속하려면 다시 로그인해 주세요.' : '',
      revision: state.revision + (changed ? 1 : 0) })
    } catch {
      if (current !== request) return
      update({ user: null, pending: false, error: '프로필을 확인하지 못했어요. 연결 상태를 확인하고 다시 로그인해 주세요.', revision: state.revision + 1 })
    }
  }

  // 이메일과 비밀번호로 로그인하고 서버가 확인한 역할을 반영한다.
  async function signIn(input: LoginInput) {
    if (state.pending) return false
    const current = ++request
    update({ pending: true, error: '' })
    try {
      const user = await api.login(input)
      if (current !== request) return false
      update({ user, pending: false, revision: state.revision + 1 })
      return true
    } catch (error) {
      if (current === request) update({ user: null, pending: false, error: loginError(error) })
      return false
    }
  }

  // 로그아웃 성공 후에만 개인 상태로 바꾸고 실패 시 재시도를 안내한다.
  async function signOut() {
    if (state.pending) return false
    const current = ++request
    update({ pending: true, error: '' })
    try {
      await api.logout()
      if (current !== request) return false
      update({ user: null, pending: false, revision: state.revision + 1 })
      return true
    } catch {
      if (current === request) update({ pending: false, error: '로그아웃하지 못했어요. 연결 상태를 확인하고 다시 시도해 주세요.' })
      return false
    }
  }

  return {
    getSnapshot: () => state,
    // 화면이 상태 변화를 구독하고 해제할 수 있게 한다.
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    refresh, signIn, signOut,
    // 인증되지 않은 개인 사용을 선택하면 지난 오류 안내를 닫는다.
    clearError() { update({ error: '' }) },
  }
}
