import { describe, expect, it, vi } from 'vitest'
import { createSession, loginError } from './session'
import type { CurrentUser } from '../api/auth'

const employee: CurrentUser = { id: '가상직원', email: 'employee@example.test', name: '가상 직원', role: 'employee' }
const admin: CurrentUser = { ...employee, id: '가상관리자', role: 'admin' }
const input = { email: 'employee@example.test', password: '가상검증문자열' }

// 네트워크 없이 인증 함수의 성공과 실패를 제어한다.
function setup() {
  const api = {
    getCurrentUser: vi.fn<() => Promise<CurrentUser | null>>().mockResolvedValue(null),
    login: vi.fn().mockResolvedValue(employee),
    logout: vi.fn().mockResolvedValue(undefined),
  }
  return { api, session: createSession(api) }
}

describe('화면 인증 상태', () => {
  it('시작 시 프로필의 역할을 복원하고 역할 변경도 반영한다', async () => {
    const { api, session } = setup()
    expect(session.getSnapshot().pending).toBe(true)
    api.getCurrentUser.mockResolvedValue(employee)
    await session.refresh()
    expect(session.getSnapshot()).toMatchObject({ user: employee, pending: false, error: '' })
    const revision = session.getSnapshot().revision
    api.getCurrentUser.mockResolvedValue({ ...employee, role: 'admin' })
    await session.refresh()
    expect(session.getSnapshot().user?.role).toBe('admin')
    expect(session.getSnapshot().revision).toBeGreaterThan(revision)
  })

  it('로그인 중 중복 제출과 로그아웃을 차단한다', async () => {
    const { api, session } = setup()
    await session.refresh()
    let complete!: (user: CurrentUser) => void
    api.login.mockImplementation(() => new Promise<CurrentUser>(resolve => { complete = resolve }))
    const first = session.signIn(input)
    expect(await session.signIn(input)).toBe(false)
    expect(await session.signOut()).toBe(false)
    expect(api.login).toHaveBeenCalledTimes(1)
    expect(api.logout).not.toHaveBeenCalled()
    complete(admin)
    expect(await first).toBe(true)
    expect(session.getSnapshot().user).toEqual(admin)
  })

  it('실패 응답의 비밀번호나 요청 내용은 안내에 포함하지 않는다', async () => {
    const { api, session } = setup()
    await session.refresh()
    api.login.mockRejectedValue({ message: input.password, request: input })
    expect(await session.signIn(input)).toBe(false)
    expect(session.getSnapshot().error).toContain('프로필')
    expect(session.getSnapshot().error).not.toContain(input.password)
    expect(session.getSnapshot().user).toBeNull()
    session.clearError()
    expect(session.getSnapshot().error).toBe('')
  })

  it('세션 만료와 프로필 오류가 나면 기존 관리자 권한을 제거한다', async () => {
    const { api, session } = setup()
    api.getCurrentUser.mockResolvedValue(admin)
    await session.refresh()
    api.getCurrentUser.mockResolvedValue(null)
    await session.refresh()
    expect(session.getSnapshot()).toMatchObject({ user: null, pending: false })
    expect(session.getSnapshot().error).toContain('만료')
    api.getCurrentUser.mockResolvedValue(admin)
    await session.refresh()
    api.getCurrentUser.mockRejectedValue(new Error('검증용 프로필 오류'))
    await session.refresh()
    expect(session.getSnapshot().user).toBeNull()
    expect(session.getSnapshot().error).toContain('프로필')
  })

  it('로그아웃 실패 시 재시도를 허용하고 성공 시 사용자와 작업 식별자를 바꾼다', async () => {
    const { api, session } = setup()
    api.getCurrentUser.mockResolvedValue(employee)
    await session.refresh()
    const revision = session.getSnapshot().revision
    api.logout.mockRejectedValueOnce(new Error('검증용 통신 오류'))
    expect(await session.signOut()).toBe(false)
    expect(session.getSnapshot().user).toEqual(employee)
    expect(session.getSnapshot().error).toContain('로그아웃')
    expect(await session.signOut()).toBe(true)
    expect(session.getSnapshot()).toMatchObject({ user: null, pending: false, error: '' })
    expect(session.getSnapshot().revision).toBeGreaterThan(revision)
  })

  it('나중에 시작한 권한 확인보다 오래된 응답을 반영하지 않는다', async () => {
    const { api, session } = setup()
    let complete!: (user: CurrentUser) => void
    api.getCurrentUser.mockImplementationOnce(() => new Promise(resolve => { complete = resolve }))
    const first = session.refresh()
    await session.refresh()
    complete(admin)
    await first
    expect(session.getSnapshot().user).toBeNull()
  })

  it('같은 사용자의 세션 갱신은 입력·결과 초기화를 일으키지 않는다', async () => {
    const { api, session } = setup()
    api.getCurrentUser.mockResolvedValue(employee)
    await session.refresh()
    const revision = session.getSnapshot().revision
    await session.refresh()
    expect(session.getSnapshot().revision).toBe(revision)
  })

  it('인증 오류 코드를 안전한 한글 안내로 바꾼다', () => {
    expect(loginError({ code: 'invalid_credentials' })).toContain('이메일이나 비밀번호')
    expect(loginError({ code: 'email_not_confirmed' })).toContain('이메일 인증')
  })
})
