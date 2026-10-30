import { afterEach, describe, expect, it } from 'vitest'
import { detect } from '../../masking/detect'
import { mask } from '../../masking/mask'
import { getMaskingMode, isRuleLocked, selectAutomaticMatches, setUnlockedRules } from './maskingPolicy'

const text = '전화 010-0000-0001, 메일 demo@example.org, 메모 가상기밀'
const matches = detect(text)

afterEach(() => setUnlockedRules([]))

describe('기업 강제 가림', () => {
  it.each(['employee', 'admin'] as const)('%s는 이전에 모든 항목을 꺼도 자동 탐지를 전부 가린다', (role) => {
    const off = new Set(matches.map((_, index) => index))
    const selected = selectAutomaticMatches(matches, off, getMaskingMode(role))
    expect(selected).toEqual(matches)
    expect(mask(text, selected)).toBe('전화 *************, 메일 ****************, 메모 가상기밀')
    expect(off.size).toBe(matches.length)
  })

  it('개인은 선택 해제한 항목을 유지한다', () => {
    const selected = selectAutomaticMatches(matches, new Set([0]), 'personal')
    expect(mask(text, selected)).toBe('전화 010-0000-0001, 메일 ****************, 메모 가상기밀')
  })

  it.each(['employee', 'admin'] as const)('%s의 직접 가림을 취소해도 자동 탐지와 겹친 부분은 가려진다', (role) => {
    const selected = selectAutomaticMatches(matches, new Set([0]), getMaskingMode(role))
    const manual = [{ start: 0, end: text.length }]
    expect(mask(text, [...selected, ...manual])).toBe('*'.repeat(text.length))
    expect(mask(text, selected)).toBe('전화 *************, 메일 ****************, 메모 가상기밀')
  })

  it.each(['employee', 'admin'] as const)('%s의 PDF는 꺼진 항목의 모든 사각형도 생성 대상으로 보낸다', (role) => {
    const pdfMatches = [
      { ruleId: 'phone' as const, regions: [{ pageNumber: 1, x: 10, y: 20, width: 30, height: 10 }] },
      { ruleId: 'email' as const, regions: [{ pageNumber: 2, x: 10, y: 20, width: 30, height: 10 }, { pageNumber: 2, x: 10, y: 40, width: 30, height: 10 }] },
    ]
    const regions = selectAutomaticMatches(pdfMatches, new Set([0, 1]), getMaskingMode(role)).flatMap((match) => match.regions)
    expect(regions).toEqual(pdfMatches.flatMap((match) => match.regions))
    expect(regions).toHaveLength(3)
  })

  it('빈 탐지 목록은 빈 결과를 반환한다', () => {
    expect(selectAutomaticMatches([], new Set(), 'company')).toEqual([])
  })

  it('관리자가 고정을 푼 룰만 기업 사용자가 해제할 수 있다', () => {
    setUnlockedRules(['email'])
    const off = new Set(matches.map((_, index) => index))
    const selected = selectAutomaticMatches(matches, off, 'company')
    expect(mask(text, selected)).toBe('전화 *************, 메일 demo@example.org, 메모 가상기밀')
    expect(isRuleLocked('phone', 'company')).toBe(true)
    expect(isRuleLocked('email', 'personal')).toBe(false)
  })

  it('공통 단어는 고정 해제 목록에 넣어도 고정된다', () => {
    setUnlockedRules(['custom'])
    expect(isRuleLocked('custom', 'company')).toBe(true)
  })
})
