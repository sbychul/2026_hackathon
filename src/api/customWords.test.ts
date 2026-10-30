import { afterEach, describe, expect, it, vi } from 'vitest'
import { detect } from '../masking/detect'
import { setCustomWords } from '../rules/rules'
import { applyCustomWords } from './customWords'

const result = vi.hoisted(() => ({ data: null as { id: string; word: string }[] | null, error: null as Error | null }))
vi.mock('../lib/supabase', () => ({
  // 공통 단어 조회 응답만 대체한다.
  supabase: { from: () => ({ select: () => ({ order: async () => result }) }) },
}))

afterEach(() => {
  setCustomWords([])
  result.data = null
  result.error = null
})

describe('공통 단어 적용', () => {
  it('기업 모드는 조회한 단어를 탐지 룰에 넣는다', async () => {
    result.data = [{ id: '1', word: '가상프로젝트명' }]
    await applyCustomWords(true)
    expect(detect('문서 가상프로젝트명').map((match) => match.ruleId)).toEqual(['custom'])
  })

  it('기업 모드에서 조회에 실패하면 오류를 넘겨 결과 화면이 멈추게 한다', async () => {
    result.error = new Error('연결 실패')
    await expect(applyCustomWords(true)).rejects.toThrow('연결 실패')
  })

  it('개인 모드는 조회 없이 단어를 비운다', async () => {
    setCustomWords(['가상프로젝트명'])
    result.error = new Error('호출되면 안 됨')
    await applyCustomWords(false)
    expect(detect('문서 가상프로젝트명')).toEqual([])
  })
})
