import { describe, expect, it } from 'vitest'
import { isValidBirthDate, passesLuhn } from '../rules/rules'
import { countByRule, detect, type Match } from './detect'
import { mask } from './mask'

// 테스트 값은 전부 가짜 정보다.
const ids = (text: string) => detect(text).map((m) => m.ruleId)

describe('룰', () => {
  it('주민등록번호 앞자리 날짜를 검사한다', () => {
    expect(isValidBirthDate('900229')).toBe(true)
    expect(isValidBirthDate('901301')).toBe(false)
    expect(isValidBirthDate('900431')).toBe(false)
  })

  it('카드번호 룬 체크섬을 검사한다', () => {
    expect(passesLuhn('4111-1111-1111-1111')).toBe(true)
    expect(passesLuhn('4111-1111-1111-1112')).toBe(false)
  })
})

describe('detect', () => {
  it('룰 4개를 모두 찾는다', () => {
    const text = '주민 900101-1234567, 폰 010-1234-5678, 메일 test@example.com, 카드 4111 1111 1111 1111'
    expect(ids(text)).toEqual(['rrn', 'phone', 'email', 'card'])
  })

  it('하이픈 없는 전화번호도 찾는다', () => {
    expect(ids('01012345678')).toEqual(['phone'])
  })

  it('날짜가 아닌 주민번호, 체크섬이 틀린 카드번호, 긴 숫자열은 무시한다', () => {
    expect(ids('991399-1234567')).toEqual([])
    expect(ids('4111-1111-1111-1112')).toEqual([])
    expect(ids('12345678901234567890')).toEqual([])
  })

  it('라벨 뒤의 이름만 찾는다', () => {
    const text = '성명: 홍길동, 이름 김철수 / 고객님 이순신'
    const found = detect(text).map((m) => text.slice(m.start, m.end))
    expect(found).toEqual(['홍길동', '김철수'])
  })

  it('도로명, 지번 주소를 찾는다', () => {
    const cases = [
      '서울특별시 강남구 테헤란로 123',
      '경기도 성남시 분당구 판교역로 235번길 10, 101동 1203호',
      '세종특별자치시 한누리대로 2130',
      '부산 해운대구 우동 1234-5',
      '충청남도 천안시 동남구 병천면 가전리 12번지',
    ]
    for (const addr of cases) {
      const text = `주소는 ${addr} 입니다`
      const [m] = detect(text)
      expect(m?.ruleId).toBe('address')
      expect(text.slice(m.start, m.end)).toBe(addr)
    }
  })

  it('시/도 없는 주소는 잡지 않는다', () => {
    expect(ids('강남구 테헤란로 123')).toEqual([])
  })

  it('찾은 위치가 원문 구간과 일치한다', () => {
    const text = '연락처: 010-1234-5678'
    const [m] = detect(text)
    expect(text.slice(m.start, m.end)).toBe('010-1234-5678')
  })
})

describe('mask', () => {
  it('선택한 구간만 가리고 길이는 유지한다', () => {
    const text = '폰 010-1234-5678 메일 a@b.co'
    const matches = detect(text)
    const phoneOnly = matches.filter((m) => m.ruleId === 'phone')
    expect(mask(text, phoneOnly)).toBe('폰 ************* 메일 a@b.co')
    expect(mask(text, matches)).toBe('폰 ************* 메일 ******')
  })

  it('구간이 없으면 원문 그대로 반환한다', () => {
    expect(mask('안녕', [])).toBe('안녕')
  })

  it('직접 고른 구간이 탐지 구간과 일부 겹쳐도 합친 범위를 모두 가린다', () => {
    expect(mask('가나다라마바', [{ start: 1, end: 3 }, { start: 2, end: 5 }])).toBe('가****바')
    expect(mask('가나다라마바', [{ start: 0, end: 4 }, { start: 1, end: 2 }])).toBe('****마바')
  })
})

describe('룰별 탐지 건수 집계', () => {
  it('빈 목록이면 일곱 룰 모두 0을 반환한다', () => {
    expect(countByRule([])).toEqual({ rrn: 0, phone: 0, email: 0, card: 0, name: 0, address: 0, account: 0 })
  })

  it('실제 탐지 결과에서 같은 룰의 반복을 포함해 일곱 룰을 집계한다', () => {
    const text = '주민 900101-1234567, 전화 010-0000-0001, 010-0000-0002, 메일 demo@example.org, '
      + '카드 4111-1111-1111-1111, 이름: 가상인, 주소 서울특별시 강남구 테헤란로 123, 계좌번호: 123-456-789012'
    expect(countByRule(detect(text))).toEqual({ rrn: 1, phone: 2, email: 1, card: 1, name: 1, address: 1, account: 1 })
  })

  it('개인 모드에서 선택한 항목만 전달하면 해당 항목만 집계한다', () => {
    const matches = detect('전화 010-0000-0001, 010-0000-0002, 메일 demo@example.org')
    const selected = matches.filter((match) => match.ruleId === 'phone').slice(0, 1)
    expect(countByRule(selected)).toEqual({ rrn: 0, phone: 1, email: 0, card: 0, name: 0, address: 0, account: 0 })
  })

  it('입력 순서와 구간을 바꾸지 않고 호출마다 독립적인 결과를 반환한다', () => {
    const matches: readonly Match[] = Object.freeze([
      Object.freeze({ ruleId: 'email' as const, start: 20, end: 36 }),
      Object.freeze({ ruleId: 'phone' as const, start: 0, end: 13 }),
    ])
    const before = structuredClone(matches)
    const first = countByRule(matches)
    first.email = 99
    expect(countByRule(matches)).toEqual({ rrn: 0, phone: 1, email: 1, card: 0, name: 0, address: 0, account: 0 })
    expect(matches).toEqual(before)
  })
})
