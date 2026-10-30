import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

export const rules = ['rrn', 'phone', 'email', 'card', 'name', 'address', 'account']

// 알려진 열만 허용해 원문이나 인증 정보가 검사 자료에 섞이는 것을 막는다.
function keys(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(key => !allowed.includes(key))) throw new Error('허용되지 않은 자료 구조 또는 열입니다.')
}

// 식별자는 실제 사용자 번호 대신 검사 안에서만 쓰는 가상 별칭으로 제한한다.
function alias(value) {
  if (typeof value !== 'string' || !/^검증[0-9]{1,6}$/.test(value)) throw new Error('검증용 별칭이 필요합니다.')
}

// 전체 조회한 기록을 검증하고 열 순서에 관계없이 비교 가능한 자료로 만든다.
function rows(value) {
  if (!Array.isArray(value)) throw new Error('기록 배열이 필요합니다.')
  const ids = new Set()
  return value.map(row => {
    keys(row, ['id', 'user', 'rule', 'count', 'input'])
    alias(row.id); alias(row.user)
    if (ids.has(row.id)) throw new Error('중복 기록 식별자입니다.')
    ids.add(row.id)
    if (!rules.includes(row.rule) || !['text', 'pdf'].includes(row.input) ||
        !Number.isSafeInteger(row.count) || row.count <= 0 || row.count > 2147483647) throw new Error('저장 기록의 룰·건수·입력 방식이 잘못되었습니다.')
    return { id: row.id, user: row.user, rule: row.rule, count: row.count, input: row.input }
  })
}

// 실제 저장 기록에서 화면과 독립적으로 순위·교차표·합계를 계산한다.
export function aggregate(users, records) {
  const table = users.map(user => ({ user, total: 0, counts: Object.fromEntries(rules.map(rule => [rule, 0])) }))
  for (const row of records) {
    const target = table.find(item => item.user === row.user)
    if (!target) throw new Error('기록의 사용자에 대응하는 프로필이 없습니다.')
    target.counts[row.rule] += row.count
    target.total += row.count
  }
  table.sort((a, b) => b.total - a.total || a.user.localeCompare(b.user))
  let rank = 0
  return {
    ranking: table.map((item, index) => {
      if (!index || item.total !== table[index - 1].total) rank = index + 1
      return { user: item.user, rank, total: item.total }
    }),
    table,
    totals: Object.fromEntries(rules.map(rule => [rule, table.reduce((sum, item) => sum + item.counts[rule], 0)])),
  }
}

// 한 시나리오의 전후 기록과 독립적으로 옮겨 적은 관리자 화면 수치를 비교한다.
export function verify(data) {
  keys(data, ['users', 'before', 'after', 'expected', 'dashboard'])
  if (!Array.isArray(data.users) || !data.users.length) throw new Error('전체 프로필 별칭이 필요합니다.')
  data.users.forEach(alias)
  if (new Set(data.users).size !== data.users.length) throw new Error('프로필 별칭이 중복되었습니다.')
  const before = rows(data.before), after = rows(data.after)
  const expected = rows(data.expected)
  for (const row of before) {
    if (!isDeepStrictEqual(row, after.find(item => item.id === row.id))) throw new Error('기존 기록이 변경되거나 사라졌습니다.')
  }
  const added = after.filter(row => !before.some(item => item.id === row.id))
  // 기대 기록 식별자는 별칭만 사용하며, 기대 건수는 탐지 결과가 아닌 수동 정답에서 가져온다.
  const sort = list => [...list].sort((a, b) => a.id.localeCompare(b.id))
  if (!isDeepStrictEqual(sort(added), sort(expected))) throw new Error('추가된 기록이 기대값과 다릅니다. 중복·누락·개인 모드 저장을 확인하세요.')
  const calculated = aggregate(data.users, after)
  if (!isDeepStrictEqual(calculated, data.dashboard)) throw new Error('관리자 화면의 순위·교차표·합계가 저장 기록과 다릅니다.')
  return { addedRows: added.length, totalRows: after.length }
}

// 오류에 원본 자료나 파일 경로를 출력하지 않고 성공 여부만 알린다.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = verify(JSON.parse(readFileSync(process.argv[2], 'utf8')))
    console.log(`기록 대조 통과: 추가 ${result.addedRows}행, 누적 ${result.totalRows}행. 화면 조작·비전송·파일 검증은 별도입니다.`)
  } catch {
    console.error('기록 대조 실패: 입력 형식, 전후 기록, 기대값과 관리자 화면 수치를 확인하세요. 원본 자료는 출력하지 않습니다.')
    process.exitCode = 1
  }
}
