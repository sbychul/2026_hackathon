import { afterEach, describe, expect, it } from 'vitest'
import { countByRule, detect } from '../masking/detect'
import { mask } from '../masking/mask'
import { RULES, setCustomWords, type RuleId } from './rules'

// 합성 텍스트에서 해당 룰이 찾은 실제 구간을 확인한다.
function find(ruleId: RuleId, text: string): string[] {
  return detect(text, RULES.filter((rule) => rule.id === ruleId))
    .map((match) => text.slice(match.start, match.end))
}

describe('일곱 가지 룰', () => {
  it('기존 식별자 여섯 개의 순서를 유지하고 계좌번호와 공통 단어를 끝에 추가한다', () => {
    expect(RULES.map((rule) => rule.id)).toEqual(['rrn', 'phone', 'email', 'card', 'name', 'address', 'account', 'custom'])
  })

  it('같은 텍스트를 반복 검사해도 일곱 종류를 모두 찾는다', () => {
    const text = '900101-1234567 / 010-1234-5678 / test@example.com / '
      + '4111-1111-1111-1111 / 이름: 홍길동 / 서울특별시 강남구 테헤란로 123 / 계좌번호: 국민 123-456-789012'
    const expected = ['rrn', 'phone', 'email', 'card', 'name', 'address', 'account']
    expect(detect(text).map((match) => match.ruleId)).toEqual(expected)
    expect(detect(text).map((match) => match.ruleId)).toEqual(expected)
  })
})

describe('계좌번호 탐지와 오탐 방지', () => {
  it.each([
    ['계좌번호: 123-456-789012', '123-456-789012'],
    ['계좌 1234567890123', '1234567890123'],
    ['계좌번호 신한 110-123-456789', '110-123-456789'],
    ['계좌번호: 국민 123-456-789012', '123-456-789012'],
    ['계좌번호: 가상은행 123-456-789012', '123-456-789012'],
    ['계좌：1234567890', '1234567890'],
    ['계좌번호： 카카오뱅크 12345678901234', '12345678901234'],
    ['계좌번호 : KB국민은행 123-4567-890', '123-4567-890'],
    ['계좌: 12345678901234입니다.', '12345678901234'],
    ['계좌번호는 123-456-789012', '123-456-789012'],
    ['계좌번호은 123-456-789012', '123-456-789012'],
    ['계좌번호(국민) 123-456-789012', '123-456-789012'],
    ['계좌번호 - 123-456-789012', '123-456-789012'],
    ['계좌번호: 우리 은행 123-456-789012', '123-456-789012'],
    ['계좌 번호: 123-456-789012', '123-456-789012'],
    ['계좌 번호는(국민 은행) 123-456-789012', '123-456-789012'],
    ['계좌: 한국 가상 은행 123-456-789012', '123-456-789012'],
  ])('라벨과 은행 이름을 보존하고 번호 전체만 가린다: %s', (text, account) => {
    const matches = detect(text, RULES.filter((rule) => rule.id === 'account'))
    expect(find('account', text)).toEqual([account])
    expect(mask(text, matches)).toBe(text.replace(account, '*'.repeat(account.length)))
  })

  it.each([
    '123-456-789012', '1234567890123', '국민 123-456-789012',
    '계좌를 알려주세요', '계좌번호: 12345', '계좌 123456789',
    '계좌번호: 123456789012345', '계좌번호: 123-456-789012345',
    '계좌번호: 12345678901234-5', '계좌번호1234567890123',
    '계좌번호: -123456789012', '계좌번호: 123456789012-',
    '계좌번호: 123--456789012', '계좌번호: 123 456 789012',
    '계좌번호: 123.456.789012',
    '계좌번호: 1234567890123456',
    '계좌번호: 한국 가상 시험 은행 123-456-789012',
    '계좌를 알려주세요 123-456-789012',
    '123-456-789012, 987-654-321098',
    '123-456-789012 및 987-654-321098',
  ])('라벨이 없거나 번호 형식과 자릿수가 맞지 않으면 탐지하지 않는다: %s', (text) => {
    expect(find('account', text)).toEqual([])
  })

  it('여러 계좌를 반복 검사해도 각각의 번호를 정확히 찾는다', () => {
    const text = '계좌번호: 국민 123-456-789012, 계좌 신한 110-123-456789'
    const expected = ['123-456-789012', '110-123-456789']
    expect(find('account', text)).toEqual(expected)
    expect(find('account', text)).toEqual(expected)
  })

  it.each([
    '계좌번호: 123-456-789012, 987-654-321098',
    '계좌번호: 123-456-789012 및 987-654-321098',
    '계좌번호(국민) 123-456-789012, 우리 은행 987-654-321098',
  ])('같은 라벨의 두 번째 번호까지 가린다: %s', (text) => {
    const accounts = ['123-456-789012', '987-654-321098']
    const matches = detect(text)
    expect(find('account', text)).toEqual(accounts)
    expect(matches.map((match) => match.ruleId)).toEqual(['account', 'account'])
    expect(mask(text, matches)).toBe(accounts.reduce(
      (result, account) => result.replace(account, '*'.repeat(account.length)), text,
    ))
  })

  it('목록의 세 번째 번호도 찾고 자릿수가 잘못된 번호는 통째로 제외한다', () => {
    const text = '계좌번호: 1234567890123456, 123-456-789012 및 987-654-321098'
    expect(find('account', text)).toEqual(['123-456-789012', '987-654-321098'])
  })

  it('목록이 마침표로 끝나면 뒤의 라벨 없는 번호로 이어가지 않는다', () => {
    expect(find('account', '계좌번호: 123-456-789012. 987-654-321098'))
      .toEqual(['123-456-789012'])
  })

  it.each([
    ['계좌번호: 010-1234-5678', 'phone'],
    ['계좌: 900101-1234567', 'rrn'],
  ])('같은 구간에서는 기존 룰만 집계하고 번호는 가린다: %s', (text, ruleId) => {
    const matches = detect(text)
    expect(matches).toHaveLength(1)
    expect(matches[0].ruleId).toBe(ruleId)
    expect(countByRule(matches)[ruleId as RuleId]).toBe(1)
    expect(countByRule(matches).account).toBe(0)
    expect(mask(text, matches)).toBe(text.replace(/[0-9-]+$/, (number) => '*'.repeat(number.length)))
  })
})

describe('이메일 오탐 방지', () => {
  it.each([
    ['bad()user@example.com', []],
    ['bad,foo@example.com', []],
    ['abc"user@example.com', []],
  ])('잘못된 이메일의 뒷부분만 부분 탐지하지 않는다: %s', (text, emails) => {
    expect(find('email', text)).toEqual(emails)
    expect(mask(text, detect(text))).toBe(text)
  })

  it('허용 기호가 있는 이메일 여러 개를 각각 전체 탐지한다', () => {
    const text = "o'connor@example.com user/name=tag@example.com"
    expect(find('email', text)).toEqual(["o'connor@example.com", 'user/name=tag@example.com'])
  })
  it.each([
    "o'connor@example.com", "'sample'@example.com", 'user/name@example.com',
    'user=tag@example.com', 'user!#$%&*+/?^_`{|}~-name@example.com',
  ])('허용 기호가 있는 이메일도 앞부분을 남기지 않고 전부 가린다: %s', (email) => {
    const text = `메일: <${email}>.`
    const matches = detect(text)
    expect(find('email', text)).toEqual([email])
    expect(mask(text, matches)).toBe(`메일: <${'*'.repeat(email.length)}>.`)
  })

  it.each([".o'connor@example.com", "o'..connor@example.com", 'bad..user/name@example.com',
    `${'a'.repeat(65)}'name@example.com`])('잘못된 아이디의 뒷부분만 이메일로 가리지 않는다: %s', (text) => {
    expect(find('email', text)).toEqual([])
    expect(mask(text, detect(text))).toBe(text)
  })

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
  it('다른 유니코드 문자에 붙은 이름 라벨은 탐지하지 않는다', () => {
    expect(find('name', '名前이름: 홍길동')).toEqual([])
  })

  it.each(['파일이름: 보고서', '성이름: 홍길동', '회사성명: 주식회사',
    '영문성함: 홍길동', 'file이름: 보고서', '_이름: 홍길동', '1성명: 홍길동',
    '이름: 미입력', '성명 미기재', '성함: 미작성', '이름: 없음'])(
    '다른 단어 안의 라벨과 미작성 상태값은 가리지 않는다: %s', (text) => {
      expect(find('name', text)).toEqual([])
      expect(mask(text, detect(text))).toBe(text)
    },
  )

  it.each([
    ['(이름: 홍길동)', '홍길동'], ['성명：남궁민수', '남궁민수'],
    ['이름:\n김가온', '김가온'], ['파일이름: 보고서 / 이름: 이민', '이민'],
    ['이름: 미입력, 성명: 김가온', '김가온'],
  ])('독립 라벨의 실제 이름과 위치는 유지한다: %s', (text, name) => {
    const matches = detect(text)
    expect(find('name', text)).toEqual([name])
    expect(mask(text, matches)).toBe(text.replace(name, '*'.repeat(name.length)))
  })

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

describe('기업 공통 단어', () => {
  afterEach(() => setCustomWords([]))

  it('단어가 없으면 아무것도 탐지하지 않는다', () => {
    setCustomWords([])
    expect(find('custom', '가상프로젝트명')).toEqual([])
  })

  it('부분 일치와 영문 대소문자 무시로 모두 찾고 긴 단어를 우선한다', () => {
    setCustomWords(['Alpha', '가상', '가상프로젝트명', 'a.b'])
    expect(find('custom', '문서 가상프로젝트명과 ALPHA팀, alphabet, a.b, axb'))
      .toEqual(['가상프로젝트명', 'ALPHA', 'alpha', 'a.b'])
  })
})
