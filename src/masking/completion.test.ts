import { describe, expect, it, vi } from 'vitest'
import { createMaskingCompletion } from './completion'
import { detect } from './detect'

const matches = detect('연락처 010-1234-5678, 이메일 sample@example.test')

describe('한 작업의 마스킹 완료 기록', () => {
  it('개인 모드는 로그인 여부와 무관하게 저장 함수를 호출하지 않는다', async () => {
    const save = vi.fn()
    const work = createMaskingCompletion(false, 'text', save)
    expect(await work.complete(matches)).toBe('skipped')
    expect(save).not.toHaveBeenCalled()
  })

  it.each(['text', 'pdf'] as const)('%s의 자동 탐지 건수만 전송하고 원문과 위치는 보내지 않는다', async (inputType) => {
    const save = vi.fn().mockResolvedValue({ savedRows: 2 })
    const work = createMaskingCompletion(true, inputType, save)
    const withValues = matches.map((match) => ({ ...match, value: '전송 금지', regions: [] }))
    expect(await work.complete(withValues)).toBe('saved')
    expect(save).toHaveBeenCalledExactlyOnceWith({ inputType, counts: { phone: 1, email: 1 } })
  })

  it('직접 가리기만 있어 자동 탐지가 0건인 작업은 저장하지 않는다', async () => {
    const save = vi.fn()
    expect(await createMaskingCompletion(true, 'pdf', save).complete([])).toBe('skipped')
    expect(save).not.toHaveBeenCalled()
  })

  it('확정 전에는 저장하지 않고 연속 확정과 완료 후 호출도 같은 요청을 재사용한다', async () => {
    let finish!: (value: { savedRows: number }) => void
    const save = vi.fn(() => new Promise<{ savedRows: number }>((resolve) => { finish = resolve }))
    const work = createMaskingCompletion(true, 'text', save)
    expect(work.getSnapshot()).toBe('ready')
    expect(save).not.toHaveBeenCalled()
    const first = work.complete(matches)
    expect(work.getSnapshot()).toBe('saving')
    expect(work.complete(matches)).toBe(first)
    await Promise.resolve()
    finish({ savedRows: 2 })
    await first
    expect(work.complete(matches)).toBe(first)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('응답 유실과 동기 오류 모두 실패 상태만 남기고 재전송하지 않는다', async () => {
    for (const save of [vi.fn().mockRejectedValue(new Error('전송 금지 원문')), vi.fn(() => { throw new Error('전송 금지 원문') })]) {
      const work = createMaskingCompletion(true, 'pdf', save)
      expect(await work.complete(matches)).toBe('failed')
      expect(await work.complete(matches)).toBe('failed')
      expect(save).toHaveBeenCalledTimes(1)
    }
  })

  it('세션 만료 등으로 실제 저장 행이 없으면 저장 성공으로 표시하지 않는다', async () => {
    const save = vi.fn().mockResolvedValue({ savedRows: 0 })
    expect(await createMaskingCompletion(true, 'text', save).complete(matches)).toBe('failed')
  })

  it('재구독은 재전송하지 않고 별도 작업 객체는 독립적으로 저장한다', async () => {
    const save = vi.fn().mockResolvedValue({ savedRows: 2 })
    const work = createMaskingCompletion(true, 'text', save)
    const listener = vi.fn()
    const unsubscribe = work.subscribe(listener)
    await work.complete(matches)
    expect(listener).toHaveBeenCalledTimes(2)
    unsubscribe()
    work.subscribe(listener)
    await work.complete(matches)
    expect(save).toHaveBeenCalledTimes(1)
    await createMaskingCompletion(true, 'text', save).complete(matches)
    expect(save).toHaveBeenCalledTimes(2)
  })
})
