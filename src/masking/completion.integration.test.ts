import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMaskingCompletion } from './completion'
import { detect } from './detect'

const fake = vi.hoisted(() => ({ user: vi.fn(), insert: vi.fn() }))
vi.mock('../api/auth', () => ({ getCurrentUser: fake.user }))
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ insert: fake.insert }) } }))

beforeEach(() => {
  vi.clearAllMocks()
  fake.user.mockResolvedValue({ id: '가상사용자', role: 'employee' })
  fake.insert.mockResolvedValue({ error: null })
})

describe('완료 상태와 실제 저장 모듈 연결', () => {
  it.each(['text', 'pdf'] as const)('%s 완료 한 번에 룰별 양수 건수만 실제 저장 형식으로 전달한다', async (inputType) => {
    const work = createMaskingCompletion(true, inputType)
    const matches = detect('010-0000-0001 010-0000-0002 sample@example.test')
    await Promise.all([work.complete(matches), work.complete(matches)])
    expect(fake.insert).toHaveBeenCalledExactlyOnceWith([
      { user_id: '가상사용자', rule_id: 'phone', count: 2, input_type: inputType },
      { user_id: '가상사용자', rule_id: 'email', count: 1, input_type: inputType },
    ])
    expect(work.getSnapshot()).toBe('saved')
  })

  it('개인 화면은 로그인 세션이 남아 있어도 인증 조회와 전송을 하지 않는다', async () => {
    await createMaskingCompletion(false, 'text').complete(detect('sample@example.test'))
    expect(fake.user).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
  })

  it('저장 요청 오류는 노출하지 않고 실패 후 확정에도 다시 전송하지 않는다', async () => {
    fake.insert.mockResolvedValue({ error: { message: '외부 응답 상세', details: '노출 금지' } })
    const work = createMaskingCompletion(true, 'pdf')
    const matches = detect('sample@example.test')
    await work.complete(matches)
    await work.complete(matches)
    expect(work.getSnapshot()).toBe('failed')
    expect(fake.insert).toHaveBeenCalledTimes(1)
  })
})
