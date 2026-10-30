import { AuthApiError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// 실제 연결 대신 인증과 프로필 조회 결과를 테스트마다 바꿔 끼운다.
const fake = vi.hoisted(() => ({
  getUser: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  profile: { data: null as unknown, error: null as unknown },
}))

vi.mock('../lib/supabase', () => {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => fake.profile,
  }
  return {
    supabase: {
      auth: { getUser: fake.getUser, signInWithPassword: fake.signInWithPassword, signOut: fake.signOut },
      from: () => query,
    },
  }
})

const { getCurrentUser, login } = await import('./auth')

beforeEach(() => {
  vi.clearAllMocks()
  fake.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'a@test.local' } }, error: null })
  fake.signInWithPassword.mockResolvedValue({ error: null })
  fake.signOut.mockResolvedValue({ error: null })
  fake.profile = { data: { id: 'u1', name: '가상 직원', role: 'employee' }, error: null }
})

describe('현재 사용자', () => {
  it('삭제되었거나 무효인 사용자는 로컬 세션을 지우고 null을 반환한다', async () => {
    fake.getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('User not found', 403, 'user_not_found') })
    await expect(getCurrentUser()).resolves.toBeNull()
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('프로필이 없으면 한글 오류를 던진다', async () => {
    fake.profile = { data: null, error: null }
    await expect(getCurrentUser()).rejects.toThrow('사용자 프로필이나 역할을 확인할 수 없습니다.')
  })
})

describe('로그인', () => {
  it('프로필 확인에 실패하면 남은 세션을 지우고 오류를 던진다', async () => {
    fake.profile = { data: null, error: null }
    await expect(login({ email: 'a@test.local', password: 'test' })).rejects.toThrow()
    expect(fake.signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('성공하면 프로필의 이름과 역할을 반환한다', async () => {
    await expect(login({ email: 'a@test.local', password: 'test' })).resolves.toEqual({
      id: 'u1', email: 'a@test.local', name: '가상 직원', role: 'employee',
    })
  })
})
