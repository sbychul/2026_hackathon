// 탐지 룰 정의. id는 Supabase `rules` 테이블의 룰 이름과 같아야 한다.

export type RuleId = 'rrn' | 'phone' | 'email' | 'card' | 'name' | 'address' | 'account'

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

// 이메일 후보의 점 위치와 도메인 이름을 검사해 잘못된 형식을 거른다.
function isValidEmail(value: string): boolean {
  const parts = value.split('@')
  if (parts.length !== 2 || value.length > 254) return false
  const local = parts[0]!
  const domain = parts[1]!
  if (local.length > 64 || !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/.test(local)) return false
  const labels = domain.split('.')
  return labels.length >= 2
    && labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label))
    && /^[A-Za-z]{2,63}$/.test(labels[labels.length - 1]!)
}

// 이름 입력란의 명확한 미작성 상태값은 사람 이름으로 집계하지 않는다.
function isValidName(value: string): boolean {
  return !['미입력', '미기재', '미작성', '없음'].includes(value)
}

// 하이픈을 제외한 계좌번호의 숫자가 열 자리부터 열네 자리인지 검사한다.
function isValidAccount(value: string): boolean {
  const length = value.replace(/-/g, '').length
  return length >= 10 && length <= 14
}

// 주소 정규식 조각: 시/도 + 시/군/구(0~2개, 세종은 없음) + 읍/면/동(선택) + 도로명 또는 지번 + 동/호/층(선택)
const SIDO =
  '(?:서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주|충청[남북]|전라[남북]|경상[남북])' +
  '(?:특별자치시|특별자치도|특별시|광역시|도)?'
const SIGUNGU = '(?:\\s+[가-힣]+(?:시|군|구)){0,2}'
const EUPMYEON = '(?:\\s+[가-힣0-9]+(?:읍|면))?'
const ROAD = '\\s+[가-힣0-9]+(?:로|길)(?:\\s*\\d+번?길)?\\s*\\d+(?:-\\d+)?'
const JIBUN = '\\s+[가-힣0-9]+(?:동|리)\\s*\\d+(?:-\\d+)?(?:번지)?'
const DETAIL = '(?:[\\s,]*\\d+(?:동|호|층))*'
const ADDRESS = `${SIDO}${SIGUNGU}${EUPMYEON}(?:${ROAD}|${JIBUN})${DETAIL}`

// 라벨과 은행 이름, 같은 목록의 앞선 번호는 탐지 구간에서 제외한다.
const ACCOUNT_LABEL = '(?:계좌\\s*번호|계좌)(?:은|는)?'
const ACCOUNT_SEPARATOR = '(?:\\s*[:：-]\\s*|\\s+|\\s*\\([가-힣A-Za-z ]+\\)\\s*[:：-]?\\s*)'
const ACCOUNT_BANK = '(?:[가-힣A-Za-z]+\\s+){0,3}'
const ACCOUNT_NUMBER = '[0-9]+(?:-[0-9]+)*'
const ACCOUNT_LIST = `(?:${ACCOUNT_NUMBER}\\s*(?:,\\s*|및\\s+)${ACCOUNT_BANK})*`
const ACCOUNT = `(?<=${ACCOUNT_LABEL}${ACCOUNT_SEPARATOR}${ACCOUNT_BANK}${ACCOUNT_LIST})${ACCOUNT_NUMBER}(?![0-9-])`

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
    // 010은 열한 자리, 그 외 휴대전화는 열 자리 또는 열한 자리이며 하이픈·점·공백 구분자를 통일한다.
    pattern: /(?<!\d)(?:010([-. ]?)\d{4}\1\d{4}|01[16789]([-. ]?)\d{3,4}\2\d{4})(?!\d)/g,
  },
  {
    id: 'email',
    name: '이메일',
    // 비인용 아이디의 허용 기호를 경계에도 적용해 이메일 앞부분이 남지 않게 한다.
    pattern: /(?<![A-Za-z0-9.!#$%&'*+/=?^_`{|}~@-])[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}(?![A-Za-z0-9@]|\.[A-Za-z0-9.-])/g,
    validate: isValidEmail,
  },
  {
    id: 'card',
    name: '카드번호',
    // 4자리씩 같은 구분자(하이픈 또는 공백)로 나뉜 16자리
    pattern: /(?<!\d)\d{4}([- ])\d{4}\1\d{4}\1\d{4}(?!\d)/g,
    validate: passesLuhn,
  },
  {
    id: 'name',
    name: '이름',
    // 다른 단어에 붙지 않은 라벨만 허용하고 라벨 뒤의 한글 2~4자만 잡는다.
    pattern: /(?<=(?<![\p{L}\p{N}_])(?:이름|성명|성함)\s*(?:[:：]\s*|\s))[가-힣]{2,4}(?![가-힣])/gu,
    validate: isValidName,
  },
  {
    id: 'address',
    name: '주소',
    pattern: new RegExp(`(?<![가-힣])${ADDRESS}`, 'g'),
  },
  {
    id: 'account',
    name: '계좌번호',
    // 확장된 라벨과 쉼표·및으로 이어지는 목록에서도 번호만 검사한다.
    pattern: new RegExp(ACCOUNT, 'g'),
    validate: isValidAccount,
  },
]
