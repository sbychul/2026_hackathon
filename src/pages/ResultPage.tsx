import { useMemo, useState } from 'react'
import Button from '../components/Button'
import RuleNum from '../components/RuleNum'
import { RULE_ORDER, ruleName, ruleNum } from '../components/ruleDisplay'
import { detect, type Match } from '../masking/detect'
import { mask, MASK_CHAR } from '../masking/mask'
import type { RuleId } from '../rules/rules'
import chevronDown from '../assets/chevron-down.svg'
import chevronRight from '../assets/chevron-right.svg'
import './ResultPage.css'

// 값이 한글이라 고정폭 글꼴을 쓰지 않는 룰
const SANS_RULES: RuleId[] = ['name', 'address']
const valueClass = (id: RuleId) => (SANS_RULES.includes(id) ? '' : 'mono')

// 원문을 일반 글 조각과 탐지 조각으로 나눈다. i는 matches 안의 순번이다.
type Segment = { text: string; match?: Match; i?: number }
function toSegments(text: string, matches: Match[]): Segment[] {
  const out: Segment[] = []
  let cursor = 0
  matches.forEach((m, i) => {
    if (m.start > cursor) out.push({ text: text.slice(cursor, m.start) })
    out.push({ text: text.slice(m.start, m.end), match: m, i })
    cursor = m.end
  })
  if (cursor < text.length) out.push({ text: text.slice(cursor) })
  return out
}

interface ResultPageProps {
  text: string
  onRestart: () => void
}

// 탐지 결과 화면(개인 모드). 항목을 골라 가리고 결과를 복사한다.
export default function ResultPage({ text, onRestart }: ResultPageProps) {
  const matches = useMemo(() => detect(text), [text])
  const segments = useMemo(() => toSegments(text, matches), [text, matches])
  // 체크를 끈 항목의 순번. 처음에는 전부 켜져 있다.
  const [off, setOff] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<RuleId>>(new Set())
  const [copied, setCopied] = useState(false)

  const selected = matches.filter((_, i) => !off.has(i))
  const groups = RULE_ORDER.map((id) => ({
    id,
    items: matches.map((m, i) => ({ m, i })).filter(({ m }) => m.ruleId === id),
  })).filter((g) => g.items.length > 0)

  // 집합에 값이 있으면 빼고 없으면 넣은 새 집합을 만든다.
  const toggled = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set)
    if (!next.delete(value)) next.add(value)
    return next
  }

  // 묶음 번호를 누르면 그 종류를 전부 켜거나, 이미 전부 켜져 있으면 전부 끈다.
  const toggleGroup = (indexes: number[]) => {
    const allOn = indexes.every((i) => !off.has(i))
    const next = new Set(off)
    indexes.forEach((i) => (allOn ? next.add(i) : next.delete(i)))
    setOff(next)
  }

  // 가린 결과를 클립보드에 넣고 잠깐 버튼 글자를 바꾼다.
  const copyResult = async () => {
    await navigator.clipboard.writeText(mask(text, selected))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <main className="result-body">
      <div className="result-head">
        <div>
          <h1 className="result-title">
            {matches.length ? `${matches.length}건을 찾았어요` : '개인정보를 찾지 못했어요'}
          </h1>
          <p className="result-desc">
            체크한 항목만 별표로 바뀌어요. 번호를 누르면 그 종류를 한꺼번에 고를 수 있어요.
          </p>
        </div>
        <div className="result-actions">
          <Button variant="secondary" onClick={onRestart}>
            처음부터 다시
          </Button>
          <Button onClick={copyResult}>{copied ? '복사했어요' : '가린 결과 복사'}</Button>
        </div>
      </div>

      <div className="work-area">
        <section className="found" aria-label="찾은 항목">
          <div className="found-head">
            <span className="found-title">찾은 항목</span>
            <span className="mono found-count">
              {selected.length} / {matches.length} 선택
            </span>
          </div>

          {groups.map(({ id, items }) => {
            const indexes = items.map(({ i }) => i)
            const onCount = indexes.filter((i) => !off.has(i)).length
            const state = onCount === items.length ? 'all' : onCount === 0 ? 'none' : 'some'
            const open = !collapsed.has(id)
            return (
              <div key={id} className="group">
                <div className={`group-head ${open ? '' : 'closed'}`}>
                  <button
                    type="button"
                    className="group-toggle"
                    aria-expanded={open}
                    aria-label={`${ruleName(id)} ${open ? '접기' : '펼치기'}`}
                    onClick={() => setCollapsed(toggled(collapsed, id))}
                  >
                    <img src={open ? chevronDown : chevronRight} width={16} height={16} alt="" />
                  </button>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={state === 'all' ? true : state === 'none' ? false : 'mixed'}
                    aria-label={`${ruleName(id)} 모두 선택`}
                    className={`group-num ${state}`}
                    onClick={() => toggleGroup(indexes)}
                  >
                    {ruleNum(id)}
                  </button>
                  <span className="group-name">{ruleName(id)}</span>
                  <span className="mono group-count">
                    {state === 'all' ? items.length : `${onCount}/${items.length}`}
                  </span>
                </div>
                {open && (
                  <ul className="group-items">
                    {items.map(({ m, i }) => (
                      <li key={i}>
                        <label className={`item ${off.has(i) ? 'off' : ''}`}>
                          <input
                            type="checkbox"
                            checked={!off.has(i)}
                            onChange={() => setOff(toggled(off, i))}
                          />
                          <span className={valueClass(m.ruleId)}>{text.slice(m.start, m.end)}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </section>

        <section className="doc">
          <div className="doc-col">
            <h2 className="doc-head">원문</h2>
            <div className="doc-text">
              {segments.map((s, k) =>
                s.match ? (
                  <mark key={k} className={`hit ${off.has(s.i!) ? '' : 'on'}`}>
                    <span className={valueClass(s.match.ruleId)}>{s.text}</span>
                    <RuleNum id={s.match.ruleId} />
                  </mark>
                ) : (
                  s.text
                ),
              )}
            </div>
          </div>
          <div className="doc-col">
            <h2 className="doc-head">가린 결과</h2>
            <div className="doc-text">
              {segments.map((s, k) =>
                !s.match ? (
                  s.text
                ) : off.has(s.i!) ? (
                  <span key={k} className={valueClass(s.match.ruleId)}>
                    {s.text}
                  </span>
                ) : (
                  <span key={k} className="masked mono">
                    {MASK_CHAR.repeat(s.text.length)}
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
