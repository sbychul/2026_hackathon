import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from '../../api/auth'
import App from '../../App'

const session = vi.hoisted(() => ({ user: null as CurrentUser | null, pending: false, error: '', revision: 0 }))
vi.mock('../../auth/useSession', () => ({
  // 인증 응답만 대체하고 실제 앱과 입력 화면의 역할 전달을 검사한다.
  useSession: () => ({ ...session, signIn: vi.fn(), signOut: vi.fn(), refresh: vi.fn(), clearError: vi.fn() }),
}))

beforeEach(() => {
  session.user = null
  session.pending = false
})

describe('로그인 역할과 기업 화면 연결', () => {
  it.each(['employee', 'admin'] as const)('%s로 인증된 사용자는 실제 앱에서도 기업 입력 화면을 본다', (role) => {
    session.user = { id: 'demo', email: null, name: '가상 사용자', role }
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('기업 개인정보 처리 안내')
    expect(html).toContain('자동으로 찾은 항목은 모두 가려져요.')
    expect(html).toContain(role === 'admin' ? '관리자' : '직원')
  })

  it('인증된 사용자가 없으면 기업 입력 화면 대신 로그인 선택을 보여 준다', () => {
    const html = renderToStaticMarkup(<App />)
    expect(html).not.toContain('기업 개인정보 처리 안내')
    expect(html).toContain('개인으로 사용하기')
  })

  it('로그인 역할 재확인 중에는 작업 화면을 숨긴다', () => {
    session.user = { id: 'demo', email: null, name: '가상 직원', role: 'employee' }
    session.pending = true
    const html = renderToStaticMarkup(<App />)
    expect(html).toContain('로그인 상태를 확인하고 있어요')
    expect(html).toContain('<div hidden="">')
  })
})
