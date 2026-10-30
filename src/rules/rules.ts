// 탐지 룰 정의. id는 Supabase `rules` 테이블의 룰 이름과 같아야 한다.

export type RuleId = 'rrn' | 'phone' | 'email' | 'card'

export interface Rule {
  id: RuleId
  name: string
  // g 플래그 필수. 앞뒤에 숫자가 붙은 긴 숫자열 안에서는 잡히지 않게 경계를 둔다.
  pattern: RegExp
  // 정규식에 걸린 값을 한 번 더 검사해서 오탐을 거른다.
  validate?: (value: string) => boolean
}

// 주민등록번호 앞 6자리(YYMMDD)가 실제 있을 수 있는 날짜인지 검사한다.
export function isValidBirthDate(value: string): boolean {
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  if (month < 1 || month > 12) return false
  // 연도 앞자리를 알 수 없으므로 윤년(2000년) 기준으로 2월 29일까지 허용한다.
  const daysInMonth = new Date(2000, month, 0).getDate()
  return day >= 1 && day <= daysInMonth
}

// 카드번호 숫자가 룬(Luhn) 체크섬을 통과하는지 검사한다.
export function passesLuhn(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i])
    if (i % 2 === 1) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
  }
  return sum % 10 === 0
}

export const RULES: Rule[] = [
  {
    id: 'rrn',
    name: '주민등록번호',
    pattern: /(?<!\d)\d{6}-\d{7}(?!\d)/g,
    validate: isValidBirthDate,
  },
  {
    id: 'phone',
    name: '전화번호',
    pattern: /(?<!\d)01[016789]-?\d{3,4}-?\d{4}(?!\d)/g,
  },
  {
    id: 'email',
    name: '이메일',
    pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  },
  {
    id: 'card',
    name: '카드번호',
    // 4자리씩 같은 구분자(하이픈 또는 공백)로 나뉜 16자리
    pattern: /(?<!\d)\d{4}([- ])\d{4}\1\d{4}\1\d{4}(?!\d)/g,
    validate: passesLuhn,
  },
]
