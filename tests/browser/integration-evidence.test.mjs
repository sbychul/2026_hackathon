import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, verify } from './integration-evidence.mjs'

// 저장 기록과 독립적인 수동 화면 수치를 가진 최소 시나리오를 만든다.
function fixture() {
  const counts = { rrn: 0, phone: 2, email: 0, card: 0, name: 0, address: 0, account: 0 }
  return {
    users: ['검증1'], before: [],
    after: [{ id: '검증1', user: '검증1', rule: 'phone', count: 2, input: 'text' }],
    expected: [{ id: '검증1', user: '검증1', rule: 'phone', count: 2, input: 'text' }],
    dashboard: { ranking: [{ user: '검증1', rank: 1, total: 2 }], table: [{ user: '검증1', total: 2, counts }], totals: counts },
  }
}

test('정상 저장과 전체 화면 수치를 대조한다', () => assert.equal(verify(fixture()).addedRows, 1))
test('개인 사용의 저장 0행을 확인한다', () => {
  const data = fixture()
  data.before = structuredClone(data.after); data.expected = []
  assert.equal(verify(data).addedRows, 0)
})
test('중복 저장·잘못된 입력 방식·0건 저장·원문 열·기록 변경을 거부한다', () => {
  for (const mutate of [
    data => data.after.push({ ...data.after[0], id: '검증2' }),
    data => { data.after[0].input = 'ocr' },
    data => { data.after[0].count = 0 },
    data => { data.after[0].text = '금지' },
    data => { data.before = [{ ...data.after[0], count: 1 }] },
    data => { data.dashboard.totals.phone = 99 },
  ]) {
    const data = structuredClone(fixture()); mutate(data)
    assert.throws(() => verify(data))
  }
})
test('동점 순위와 기록 없는 프로필을 유지한다', () => {
  const result = aggregate(['검증1', '검증2', '검증3'], [
    { user: '검증1', rule: 'phone', count: 1 }, { user: '검증2', rule: 'phone', count: 1 },
  ])
  assert.deepEqual(result.ranking.map(item => item.rank), [1, 1, 3])
  assert.equal(result.table[2].total, 0)
})
