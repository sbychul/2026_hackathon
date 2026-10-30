import { useEffect, useState } from 'react'
import Button from '../Button'
import { listRuleLocks, setRuleLock, type RuleLock } from '../../api/ruleLocks'
import { RULE_ORDER, ruleName } from '../ruleDisplay'
import type { RuleId } from '../../rules/rules'

type LoadState = 'loading' | 'error' | 'ready'

// 관리자가 기본 탐지 룰마다 기업 사용자의 가림을 고정할지 정하는 화면.
export default function RuleLocksPanel() {
  const [load, setLoad] = useState<LoadState>('loading')
  const [locks, setLocks] = useState<RuleLock[]>([])
  const [savingId, setSavingId] = useState<RuleId | null>(null)
  const [saveError, setSaveError] = useState('')

  // 룰별 고정 여부를 화면 순서대로 다시 불러온다.
  function reload() {
    setLoad('loading')
    listRuleLocks().then((list) => {
      setLocks([...list].sort((a, b) => RULE_ORDER.indexOf(a.id) - RULE_ORDER.indexOf(b.id)))
      setLoad('ready')
    }, () => setLoad('error'))
  }

  useEffect(reload, [])

  // 고정 여부를 저장하고 실패하면 이전 상태를 그대로 둔다.
  async function toggle(id: RuleId, locked: boolean) {
    setSavingId(id)
    setSaveError('')
    try {
      await setRuleLock(id, locked)
      setLocks((list) => list.map((item) => item.id === id ? { ...item, locked } : item))
    } catch (error) {
      setSaveError(`${ruleName(id)}: ${error instanceof Error ? error.message : '고정 설정을 저장하지 못했어요.'}`)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <>
      <section className="admin-panel">
        <h2>고정한 항목은 직원이 해제할 수 없어요</h2>
        <p>고정을 풀면 직원과 관리자가 결과 화면에서 그 종류의 항목을 체크박스로 해제할 수 있어요. 기업 가림 단어는 항상 고정돼요.</p>
      </section>
      <section className="admin-panel" aria-labelledby="rule-lock-title" aria-busy={load === 'loading'}>
        <h2 id="rule-lock-title">자동 탐지 항목 · {locks.filter((item) => item.locked).length}/{locks.length} 고정</h2>
        {load === 'loading' && <p role="status">고정 설정을 불러오고 있어요.</p>}
        {load === 'error' && <div role="alert" className="custom-word-state"><p>고정 설정을 불러오지 못했어요.</p><Button variant="secondary" onClick={reload}>다시 조회</Button></div>}
        {saveError && <p className="custom-word-error" role="alert">{saveError} 설정은 바뀌지 않았어요.</p>}
        {load === 'ready' && <ul className="custom-word-list">
          {locks.map((item) => <li key={item.id}>
            <label className="custom-word-row rule-lock-row">
              <strong>{ruleName(item.id)}</strong>
              <span className="custom-word-tag">{savingId === item.id ? '저장 중…' : item.locked ? '고정 · 해제 불가' : '직원이 해제 가능'}</span>
              <input type="checkbox" checked={item.locked} disabled={savingId !== null} onChange={(e) => void toggle(item.id, e.target.checked)} aria-label={`${ruleName(item.id)} 고정`} />
            </label>
          </li>)}
        </ul>}
      </section>
    </>
  )
}
