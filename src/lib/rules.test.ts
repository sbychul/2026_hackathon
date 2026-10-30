import { describe, expect, it } from 'vitest'
import { RULES, isValidBirthDate, isValidEmail, isValidPhone, isValidRrn, passesLuhn, type RuleId } from './rules'

// 실제 개인정보 대신 합성 값과 공개 테스트용 카드번호를 사용한다.
// 정규식으로 찾은 후보에 추가 검증까지 적용한 결과를 반환한다.
function find(id: RuleId, text: string): string[] {
  const rule = RULES.find((candidate) => candidate.id === id)!
  return [...text.matchAll(rule.pattern)].map((match) => match[0]).filter(rule.validate)
}

describe('룰 정의', () => {
  it('네 가지 이름과 식별자가 중복 없이 정의되고 검증 함수를 가진다', () => {
    expect(RULES.map(({ id }) => id)).toEqual(['rrn', 'phone', 'email', 'card'])
    expect(RULES.map(({ name }) => name)).toEqual(['주민등록번호', '전화번호', '이메일', '카드번호'])
    for (const rule of RULES) {
      expect(rule.pattern.global).toBe(true)
      expect(typeof rule.validate).toBe('function')
    }
  })

  it('반복 호출에서도 같은 후보와 원문 위치를 찾는다', () => {
    const text = '전화: 010-1234-5678, 01098765432'
    const rule = RULES.find(({ id }) => id === 'phone')!
    expect(find('phone', text)).toEqual(['010-1234-5678', '01098765432'])
    expect(find('phone', text)).toEqual(['010-1234-5678', '01098765432'])
    for (const match of text.matchAll(rule.pattern)) {
      expect(text.slice(match.index, match.index + match[0].length)).toBe(match[0])
    }
  })
})

describe('주민등록번호', () => {
  it.each(['900101-1234567', '000229-3234567', '040229-4234567', '991231-2234567'])(
    '실제 날짜를 가진 합성 번호를 탐지한다: %s', (value) => {
      expect(find('rrn', `번호: ${value}.`)).toEqual([value])
    },
  )

  it.each(['900229-1234567', '000229-1234567', '010229-3234567', '900431-1234567',
    '901301-1234567', '900001-1234567', '900100-1234567', '9001011234567',
    '1900101-1234567', '900101-12345678', '900101-1234567-8'])(
    '잘못된 날짜와 자릿수는 탐지하지 않는다: %s', (value) => {
      expect(find('rrn', value)).toEqual([])
      expect(isValidRrn(value)).toBe(false)
    },
  )

  it('독립된 생년월일도 윤년과 입력 형태를 검사한다', () => {
    expect(isValidBirthDate('000229')).toBe(true)
    expect(isValidBirthDate('900229')).toBe(false)
    expect(isValidBirthDate('040229')).toBe(true)
    for (const value of ['', 'abcdef', '900101추가', '991332', '990231']) {
      expect(isValidBirthDate(value)).toBe(false)
    }
  })
})

describe('전화번호', () => {
  it.each(['010-1234-5678', '01012345678', '011-123-4567', '0111234567',
    '016-1234-5678', '0171234567', '018-123-4567', '01912345678'])(
    '휴대전화 번호를 탐지한다: %s', (value) => {
      expect(find('phone', `연락처(${value})`)).toEqual([value])
      expect(isValidPhone(value)).toBe(true)
    },
  )

  it.each(['010-123-4567', '0101234567', '012-1234-5678', '02-1234-5678',
    '010-12345678', '0101234-5678', '010--1234-5678', '010 1234 5678',
    '101012345678', '010123456789', '010-1234-56789', '010-1234-5678-9'])(
    '잘못된 식별번호와 자릿수 및 혼합 구분자는 거른다: %s', (value) => {
      expect(find('phone', value)).toEqual([])
      expect(isValidPhone(value)).toBe(false)
    },
  )
})

describe('이메일', () => {
  it.each(['test@example.com', 'first.last+tag@example.co.kr', 'USER_01@sub.example.org'])(
    '일반 이메일을 탐지한다: %s', (value) => {
      expect(find('email', `메일: <${value}>.`)).toEqual([value])
      expect(isValidEmail(value)).toBe(true)
    },
  )

  it.each(['.test@example.com', 'test.@example.com', 'te..st@example.com',
    'test@@example.com', 'test@example', 'test@example.c', 'test@-example.com',
    'test@example-.com', 'test@example..com', 'test@example.com1', 'test@example.com_extra',
    'test@sub.example..com', `${'a'.repeat(65)}@example.com`, `a@${'b'.repeat(64)}.com`])(
    '잘못된 이메일 전체 또는 일부를 탐지하지 않는다: %s', (value) => {
      expect(find('email', value)).toEqual([])
      expect(isValidEmail(value)).toBe(false)
    },
  )

  it('서로 다른 이메일을 모두 찾는다', () => {
    expect(find('email', 'a@example.com, b@example.org.')).toEqual(['a@example.com', 'b@example.org'])
  })
})

describe('카드번호', () => {
  it.each(['4111111111111111', '4111-1111-1111-1111', '4111 1111 1111 1111',
    '5555-5555-5555-4444', '4012-8888-8888-1881'])(
    '체크섬이 맞는 공개 테스트 번호를 탐지한다: %s', (value) => {
      expect(find('card', `카드(${value})`)).toEqual([value])
      expect(passesLuhn(value)).toBe(true)
    },
  )

  it.each(['4111-1111-1111-1112', '0000-0000-0000-0000', '4111-1111 1111-1111',
    '4111/1111/1111/1111', '4111\n1111\n1111\n1111', '411111111111111',
    '14111111111111111', '4111-1111-1111-11111', '4111-1111-1111-1111-2', '', '임의 문자열'])(
    '체크섬 오류와 잘못된 형태는 거른다: %s', (value) => {
      expect(find('card', value)).toEqual([])
      expect(passesLuhn(value)).toBe(false)
    },
  )
})
