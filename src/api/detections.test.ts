import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUser } from './auth'

// 현재 사용자 조회와 저장 요청을 가짜로 바꿔 저장되는 행만 확인한다.
const fake = vi.hoisted(() => ({
  user: null as CurrentUser | null,
  getCurrentUser: vi.fn(),
  insert: vi.fn(),
}))

vi.mock('./auth', () => ({ getCurrentUser: fake.getCurrentUser }))
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ insert: fake.insert }) } }))

const { saveDetections } = await import('./detections')

beforeEach(() => {
  vi.clearAllMocks()
  fake.getCurrentUser.mockImplementation(async () => fake.user)
  fake.insert.mockResolvedValue({ error: null })
  fake.user = { id: 'u1', email: null, name: '가상 직원', role: 'employee' }
})

describe('탐지 기록 저장', () => {
  it('양수 건수만 룰마다 한 줄로 한 번에 저장한다', async () => {
    await expect(saveDetections({ inputType: 'pdf', counts: { rrn: 2, phone: 0, email: 1 } }))
      .resolves.toEqual({ savedRows: 2 })
    expect(fake.insert).toHaveBeenCalledTimes(1)
    expect(fake.insert).toHaveBeenCalledWith([
      { user_id: 'u1', rule_id: 'rrn', count: 2, input_type: 'pdf' },
      { user_id: 'u1', rule_id: 'email', count: 1, input_type: 'pdf' },
    ])
  })

  it('값이 undefined인 룰은 생략한 룰로 보고 건너뛴다', async () => {
    await expect(saveDetections({ inputType: 'text', counts: { rrn: undefined, phone: 1 } }))
      .resolves.toEqual({ savedRows: 1 })
  })

  it('저장할 건수가 없으면 로그인 확인과 저장을 하지 않는다', async () => {
    await expect(saveDetections({ inputType: 'text', counts: { rrn: 0 } })).resolves.toEqual({ savedRows: 0 })
    expect(fake.getCurrentUser).not.toHaveBeenCalled()
    expect(fake.insert).not.toHaveBeenCalled()
  })

  it('비로그인 개인 모드는 저장하지 않는다', async () => {
    fake.user = null
    await expect(saveDetections({ inputType: 'text', counts: { rrn: 1 } })).resolves.toEqual({ savedRows: 0 })
    expect(fake.insert).not.toHaveBeenCalled()
  })

  it('잘못된 건수, 룰, 입력 방식은 오류다', async () => {
    await expect(saveDetections({ inputType: 'text', counts: { rrn: 2.5 } })).rejects.toThrow()
    await expect(saveDetections({ inputType: 'text', counts: { rrn: -1 } })).rejects.toThrow()
    await expect(saveDetections({ inputType: 'text', counts: { rrn: 2_147_483_648 } })).rejects.toThrow()
    await expect(saveDetections({ inputType: 'text', counts: { foo: 1 } as never })).rejects.toThrow()
    await expect(saveDetections({ inputType: 'docx' as never, counts: { rrn: 1 } })).rejects.toThrow()
    expect(fake.insert).not.toHaveBeenCalled()
  })
})
