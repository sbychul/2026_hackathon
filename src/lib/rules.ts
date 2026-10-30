export type RuleId = 'rrn' | 'phone' | 'email' | 'card'

export interface Rule {
  id: RuleId
  name: string
  pattern: RegExp
  validate: (value: string) => boolean
}

const RRN_FORMAT = /^\d{6}-\d{7}$/
const PHONE_FORMAT = /^(?:010(?:-\d{4}-\d{4}|\d{8})|01[16789](?:-\d{3,4}-\d{4}|\d{7,8}))$/
const CARD_FORMAT = /^\d{4}([- ]?)\d{4}\1\d{4}\1\d{4}$/

// 생년월일 여섯 자리 또는 주민등록번호의 날짜가 실제 달력에 존재하는지 검사한다.
export function isValidBirthDate(value: string): boolean {
  if (!/^\d{6}$/.test(value) && !RRN_FORMAT.test(value)) return false
  const shortYear = Number(value.slice(0, 2))
  const marker = value[7]
  const century = marker && '1256'.includes(marker) ? 1900
    : marker && '90'.includes(marker) ? 1800 : 2000
  const year = century + shortYear
  const month = Number(value.slice(2, 4))
  const day = Number(value.slice(4, 6))
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!
}

// 주민등록번호의 전체 형태와 생년월일을 함께 검사한다.
export function isValidRrn(value: string): boolean {
  return RRN_FORMAT.test(value) && isValidBirthDate(value)
}

// 휴대전화 식별번호별 자릿수와 일관된 하이픈 사용을 검사한다.
export function isValidPhone(value: string): boolean {
  return PHONE_FORMAT.test(value)
}

// 일반적인 이메일의 길이, 점 위치, 도메인 이름을 검사한다.
export function isValidEmail(value: string): boolean {
  const parts = value.split('@')
  if (parts.length !== 2 || value.length > 254) return false
  const [local, domain] = parts as [string, string]
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return false
  if (!/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false
  const labels = domain.split('.')
  return labels.length >= 2
    && labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
    && /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]!)
}

// 열여섯 자리 카드 후보의 형식과 룬 체크섬을 검사한다.
export function passesLuhn(value: string): boolean {
  if (!CARD_FORMAT.test(value)) return false
  const digits = value.replace(/[- ]/g, '')
  if (/^(\d)\1{15}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[i])
    if (i % 2 === 0) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum % 10 === 0
}

// 식별자는 기존 탐지 코드, 표시 이름은 명세의 네 가지 룰 이름과 맞춘다.
export const RULES: Rule[] = [
  {
    id: 'rrn',
    name: '주민등록번호',
    pattern: /(?<![\d-])\d{6}-\d{7}(?![\d-])/g,
    validate: isValidRrn,
  },
  {
    id: 'phone',
    name: '전화번호',
    pattern: /(?<![\d-])01[016789](?:-\d{3,4}-\d{4}|\d{7,8})(?![\d-])/g,
    validate: isValidPhone,
  },
  {
    id: 'email',
    name: '이메일',
    pattern: /(?<![A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![A-Za-z0-9_@-]|\.[A-Za-z0-9.-])/g,
    validate: isValidEmail,
  },
  {
    id: 'card',
    name: '카드번호',
    pattern: /(?<![\d-])\d{4}([- ]?)\d{4}\1\d{4}\1\d{4}(?![\d-])/g,
    validate: passesLuhn,
  },
]
