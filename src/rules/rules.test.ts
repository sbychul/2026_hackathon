import { describe, expect, it } from 'vitest'
import { detect } from '../masking/detect'
import { mask } from '../masking/mask'
import { RULES, type RuleId } from './rules'

// 합성 텍스트에서 해당 룰이 찾은 실제 구간을 확인한다.
function find(ruleId: RuleId, text: string): string[] {
  return detect(text, RULES.filter((rule) => rule.id === ruleId))
    .map((match) => text.slice(match.start, match.end))
}

describe('여섯 가지 룰', () => {
  it('기존 식별자 여섯 개를 중복 없이 유지한다', () => {
    expect(RULES.map((rule) => rule.id)).toEqual(['rrn', 'phone', 'email', 'card', 'name', 'address'])
  })

  it('같은 텍스트를 반복 검사해도 여섯 종류를 모두 찾는다', () => {
    const text = '900101-1234567 / 010-1234-5678 / test@example.com / '
      + '4111-1111-1111-1111 / 이름: 홍길동 / 서울특별시 강남구 테헤란로 123'
    const expected = ['rrn', 'phone', 'email', 'card', 'name', 'address']
    expect(detect(text).map((match) => match.ruleId)).toEqual(expected)
    expect(detect(text).map((match) => match.ruleId)).toEqual(expected)
  })
})

describe('이메일 오탐 방지', () => {
  it.each(['test@', '@example.com', 'test.example.com', 'test@example',
    'test@example.c', 'test @example.com', 'test@example .com',
    '.test@example.com', 'test.@example.com', 'te..st@example.com',
    'test@@example.com', 'test@-example.com', 'test@example-.com',
    'test@example..com', 'test@sub.example..com', 'test@example.com1'])(
    '불완전하거나 잘못된 이메일을 탐지하지 않는다: %s', (text) => {
      expect(find('email', text)).toEqual([])
    },
  )

  it.each(['test@example.com', 'first.last+tag@example.co.kr', 'USER_01@sub.example.org'])(
    '문장 속 정상 이메일의 정확한 구간을 찾는다: %s', (email) => {
      expect(find('email', `이메일: <${email}>.`)).toEqual([email])
    },
  )

  it('쉼표와 마침표로 구분된 이메일을 각각 찾는다', () => {
    expect(find('email', 'a@example.com, b@example.org.')).toEqual(['a@example.com', 'b@example.org'])
  })

  it.each([
    ['메일 a@example.com-담당', 'a@example.com'],
    ['a@example.com_', 'a@example.com'],
    ['test@example.com_extra', 'test@example.com'],
    ['메일 a@example.com- b@example.org_', 'a@example.com', 'b@example.org'],
  ])('이메일 뒤 하이픈과 밑줄 때문에 정상 주소를 놓치지 않는다: %s', (text, ...emails) => {
    expect(find('email', text)).toEqual(emails)
    const matches = detect(text, RULES.filter((rule) => rule.id === 'email'))
    expect(mask(text, matches)).not.toContain('a@example.com')
    expect(mask(text, matches)).not.toContain('test@example.com')
  })
})

describe('휴대전화 오탐 방지', () => {
  it.each(['010-123-456', '02-1234-5678', '031-123-4567', '012-1234-5678',
    '010-123-4567', '0101234567', '010-12345678', '0101234-5678',
    '010--1234-5678', '010123456789', '101012345678', '010-1234-56789',
    '010-1234 5678', '010.1234-5678', '010 1234.5678', '011-123 4567'])(
    '휴대전화가 아니거나 자릿수와 구분자가 잘못되면 탐지하지 않는다: %s', (text) => {
      expect(find('phone', text)).toEqual([])
    },
  )

  it.each(['010-1234-5678', '01012345678', '011-123-4567', '0111234567',
    '016-1234-5678', '0171234567', '018-123-4567', '01912345678',
    '010 1234 5678', '010.1234.5678', '011 123 4567', '011.123.4567',
    '011 1234 5678', '011.1234.5678'])(
    '하이픈·공백·점 구분자와 붙여 쓴 휴대전화를 찾는다: %s', (phone) => {
      expect(find('phone', `연락처(${phone})`)).toEqual([phone])
    },
  )

  it.each([
    ['TEL 010-1234-5678-', '010-1234-5678'],
    ['연락처:-010-1234-5678', '010-1234-5678'],
    ['010-1234-5678-9', '010-1234-5678'],
    ['번호01012345678입니다', '01012345678'],
    ['번호0111234567입니다', '0111234567'],
    ['연락처 010 1234 5678', '010 1234 5678'],
    ['번호010.1234.5678입니다', '010.1234.5678'],
    ['연락처:-010 1234 5678-', '010 1234 5678'],
  ])('문장과 구두점 사이에서도 전화번호의 정확한 구간을 찾는다: %s', (text, phone) => {
    expect(find('phone', text)).toEqual([phone])
    const matches = detect(text, RULES.filter((rule) => rule.id === 'phone'))
    expect(mask(text, matches)).toBe(text.replace(phone, '*'.repeat(phone.length)))
  })
})

describe('이름 오탐 방지', () => {
  it.each(['이름: 가나다라마바사', '성명 홍길동마바사', '성함: 홍길동마바',
    '이름을 입력하세요', '이름: 입력하세요', '성명을 작성하세요',
    '성함을 알려주세요', '홍길동 님', '이름: 홍', '성명: John'])(
    '긴 한글과 안내 문장 및 라벨 없는 이름은 탐지하지 않는다: %s', (text) => {
      expect(find('name', text)).toEqual([])
    },
  )

  it.each(['이름: 홍길동', '성명 김철수', '성함：남궁민수', '이름: 이민'])(
    '라벨은 보존하고 두 글자부터 네 글자의 이름만 가린다: %s', (text) => {
      const matches = detect(text, RULES.filter((rule) => rule.id === 'name'))
      const name = text.match(/[가-힣]+$/)![0]
      expect(find('name', text)).toEqual([name])
      expect(mask(text, matches)).toBe(text.slice(0, text.length - name.length) + '*'.repeat(name.length))
    },
  )
})

describe('주소 오탐 방지', () => {
  it.each(['서울에서 만나요', '서울특별시', '경기도에 살아요', '부산 해운대구에서 만나요',
    '세종특별자치시 한누리대로', '서울특별시 강남구 역삼동',
    '강남구 테헤란로 123', '분당구 판교역로 235', '해운대구 우동 1234-5',
    '서울특별시 가상아파트'])(
    '시도만 있거나 필수 주소 형식이 빠지면 탐지하지 않는다: %s', (text) => {
      expect(find('address', text)).toEqual([])
    },
  )

  it.each(['서울특별시 강남구 테헤란로 123',
    '경기도 성남시 분당구 판교역로 235번길 10, 101동 1203호',
    '세종특별자치시 한누리대로 2130', '부산 해운대구 우동 1234-5',
    '충청남도 천안시 동남구 병천면 가전리 12번지',
    '서울특별시 강남구 테헤란로 123 101동 1203호 3층'])(
    '도로명과 지번 및 동호층을 정확한 구간으로 찾는다: %s', (address) => {
      expect(find('address', `주소: ${address} 입니다.`)).toEqual([address])
    },
  )
})
