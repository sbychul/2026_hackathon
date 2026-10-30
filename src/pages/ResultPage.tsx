import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import Button from '../components/Button'
import RuleNum from '../components/RuleNum'
import EnterpriseNotice from '../components/enterprise/EnterpriseNotice'
import { selectAutomaticMatches, type MaskingMode } from '../components/enterprise/maskingPolicy'
import { RULE_ORDER, ruleName, ruleNum } from '../components/ruleDisplay'
import { detect } from '../masking/detect'
import { mask, type MaskRange } from '../masking/mask'
import { useMaskingCompletion } from '../hooks/useMaskingCompletion'
import type { RuleId } from '../rules/rules'
import chevronDown from '../assets/chevron-down.svg'
import chevronRight from '../assets/chevron-right.svg'
import './ResultPage.css'

// 값이 한글이라 고정폭 글꼴을 쓰지 않는 룰
const SANS_RULES: RuleId[] = ['name', 'address', 'custom']
const valueClass = (id: RuleId) => (SANS_RULES.includes(id) ? '' : 'mono')

// 글을 일반 조각과 구간 조각으로 나눈다. i는 ranges 안의 순번이다.
type Segment<T> = { text: string; range?: T; i?: number }
function toSegments<T extends MaskRange>(text: string, ranges: T[]): Segment<T>[] {
  const out: Segment<T>[] = []
  let cursor = 0
  ranges.forEach((r, i) => {
    if (r.start > cursor) out.push({ text: text.slice(cursor, r.start) })
    out.push({ text: text.slice(r.start, r.end), range: r, i })
    cursor = r.end
  })
  if (cursor < text.length) out.push({ text: text.slice(cursor) })
  return out
}

// 겹치거나 맞닿은 구간을 합쳐 앞에서부터 정리한다.
function mergeRanges(ranges: readonly MaskRange[]): MaskRange[] {
  const out: MaskRange[] = []
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out[out.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else out.push({ ...r })
  }
  return out
}

// 원문 칸 안의 한 지점이 원문 몇 번째 글자인지 센다. 번호 표시는 ::before라 글자 수에 들어가지 않는다.
function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange()
  range.setStart(root, 0)
  range.setEnd(node, offset)
  return range.toString().length
}

// 원문 글자 위치를 원문 칸 안의 DOM 위치로 바꾼다.
function domPoint(root: Node, offset: number): [Node, number] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let left = offset
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.textContent?.length ?? 0
    if (left <= len) return [node, left]
    left -= len
  }
  return [root, root.childNodes.length]
}

interface ResultPageProps {
  text: string
  onRestart: () => void
  mode?: MaskingMode
}

// 개인은 항목을 선택하고 기업은 모두 가린다. 직접 추가한 가림과 같은 결과를 복사한다.
export default function ResultPage(props: ResultPageProps) {
  const identity = useMemo(() => ({ text: props.text, mode: props.mode, key: crypto.randomUUID() }), [props.text, props.mode])
  return <TextResultDocument key={identity.key} {...props} />
}

// 같은 입력의 재렌더링은 완료 상태를 유지하고 새 입력은 별도 작업으로 처리한다.
function TextResultDocument({ text, onRestart, mode = 'personal' }: ResultPageProps) {
  const enterprise = mode === 'company'
  const completion = useMaskingCompletion(enterprise, 'text')
  const matches = useMemo(() => detect(text), [text])
  const segments = useMemo(() => toSegments(text, matches), [text, matches])
  // 체크를 끈 항목의 순번. 처음에는 전부 켜져 있다.
  const [off, setOff] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<RuleId>>(new Set())
  const [copied, setCopied] = useState(false)
  const [copyError, setCopyError] = useState(false)
  // 사용자가 원문에서 드래그해 직접 가린 구간과, 지금 드래그로 고른 구간
  const [manual, setManual] = useState<MaskRange[]>([])
  const [pending, setPending] = useState<MaskRange | null>(null)
  // 드래그 대신 글자를 입력해 가리는 칸과, 화면 읽기 프로그램에 알릴 처리 결과
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const sourceRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)

  // 화면이 바뀌면 초점을 제목으로 옮겨 키보드·화면 읽기 사용자가 위치를 잃지 않게 한다.
  useEffect(() => titleRef.current?.focus({ preventScroll: true }), [])

  const selected = selectAutomaticMatches(matches, off, mode)
  const maskedRanges = mergeRanges([...selected, ...manual])
  // 화면과 복사가 같은 결과를 쓰도록 mask() 결과 하나만 만든다. mask()는 글자 수를 바꾸지 않는다.
  const masked = mask(text, maskedRanges)
  const groups = RULE_ORDER.map((id) => ({
    id,
    items: matches.map((m, i) => ({ m, i })).filter(({ m }) => m.ruleId === id),
  })).filter((g) => g.items.length > 0)

  // 직접 가린 구간을 원문 칸에 표시한다. 글자를 감싸지 않아 탐지 표시와 겹쳐도 깨지지 않는다.
  useEffect(() => {
    const root = sourceRef.current
    if (!root || typeof CSS === 'undefined' || !CSS.highlights) return
    const ranges = manual.map(({ start, end }) => {
      const range = document.createRange()
      range.setStart(...domPoint(root, start))
      range.setEnd(...domPoint(root, end))
      return range
    })
    CSS.highlights.set('manual-mask', new Highlight(...ranges))
    return () => {
      CSS.highlights.delete('manual-mask')
    }
  }, [manual])

  // 원문 칸에서 마우스·터치·키보드로 고른 구간을 기억한다. 앞뒤 공백은 뺀다.
  // 모바일은 가리기 버튼을 누르는 순간 선택이 풀리므로, 원문 밖에서 선택이 풀리면 마지막 선택을 유지한다.
  useEffect(() => {
    const readSelection = () => {
      const root = sourceRef.current
      const sel = getSelection()
      if (!root || !sel || sel.rangeCount === 0) return
      const r = sel.getRangeAt(0)
      if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return
      if (sel.isCollapsed) return setPending(null)
      let start = textOffset(root, r.startContainer, r.startOffset)
      let end = textOffset(root, r.endContainer, r.endOffset)
      while (start < end && /\s/.test(text[start]!)) start++
      while (end > start && /\s/.test(text[end - 1]!)) end--
      setPending(end > start ? { start, end } : null)
    }
    document.addEventListener('selectionchange', readSelection)
    return () => document.removeEventListener('selectionchange', readSelection)
  }, [text])

  // 고른 구간을 직접 가린 목록에 넣고 선택을 지운다.
  const addManual = () => {
    if (!pending) return
    setManual([...manual, pending])
    setPending(null)
    setNotice('선택한 부분을 가렸어요.')
    getSelection()?.removeAllRanges()
  }

  // 드래그의 대체 방법. 입력한 글자가 원문에 나오는 곳을 모두 직접 가린 목록에 넣는다.
  const addByText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const word = query.trim()
    if (!word) return
    const found: MaskRange[] = []
    for (let at = text.indexOf(word); at !== -1; at = text.indexOf(word, at + word.length)) {
      found.push({ start: at, end: at + word.length })
    }
    if (!found.length) return setNotice('원문에서 입력한 글자를 찾지 못했어요.')
    const fresh = found.filter((r) => !manual.some((m) => m.start === r.start && m.end === r.end))
    setManual([...manual, ...fresh])
    setQuery('')
    setNotice(`${found.length}곳을 가렸어요.`)
  }

  // 직접 가린 구간을 취소하고, 사라진 버튼 대신 입력 칸으로 초점을 옮긴다.
  const cancelManual = (k: number) => {
    setManual(manual.filter((_, j) => j !== k))
    setNotice('가리기를 취소했어요.')
    queryRef.current?.focus()
  }

  // 집합에 값이 있으면 빼고 없으면 넣은 새 집합을 만든다.
  const toggled = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set)
    if (!next.delete(value)) next.add(value)
    return next
  }

  // 묶음 번호를 누르면 그 종류를 전부 켜거나, 이미 전부 켜져 있으면 전부 끈다.
  const toggleGroup = (indexes: number[]) => {
    if (enterprise) return
    const allOn = indexes.every((i) => !off.has(i))
    const next = new Set(off)
    indexes.forEach((i) => (allOn ? next.add(i) : next.delete(i)))
    setOff(next)
  }

  // 가린 결과를 클립보드에 넣고 잠깐 버튼 글자를 바꾼다.
  const copyResult = async () => {
    if (!completion.canExport) return
    try {
      await navigator.clipboard.writeText(masked)
      setCopyError(false)
      setCopied(true)
      setNotice('가린 결과를 복사했어요.')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
      setCopyError(true)
      setNotice('복사하지 못했어요. 가린 결과 칸의 글을 직접 선택해 복사해 주세요.')
      setTimeout(() => setCopyError(false), 2000)
    }
  }

  return (
    <main className={`result-body ${enterprise ? 'enterprise-page enterprise-result' : ''}`}>
      {enterprise && <p className="enterprise-eyebrow">기업 모드 · 자동 탐지 전체 가림</p>}
      <div className="result-head">
        <div>
          <h1 className="result-title" ref={titleRef} tabIndex={-1}>
            {matches.length ? enterprise ? `${matches.length}건을 모두 가렸어요` : `${matches.length}건을 찾았어요` : '개인정보를 찾지 못했어요'}
          </h1>
          <p className="result-desc">
            {enterprise ? '자동 탐지된 항목은 해제할 수 없어요. 놓친 부분은 원문에서 직접 추가로 가려 주세요.' : '체크한 항목만 별표로 바뀌어요. 놓친 부분은 원문에서 드래그해 가리거나, 가릴 글자를 입력하세요.'}
          </p>
          <p className="visually-hidden" role="status">{notice}</p>
        </div>
        <div className="result-actions">
          <Button variant="secondary" disabled={completion.status === 'saving'} onClick={onRestart}>
            처음부터 다시
          </Button>
          {enterprise && <Button disabled={completion.status !== 'ready'} onClick={() => void completion.complete(matches)}>{completion.buttonLabel}</Button>}
          <Button disabled={!completion.canExport} onClick={copyResult}>
            {copied ? '복사했어요' : copyError ? '복사하지 못했어요' : '가린 결과 복사'}
          </Button>
        </div>
      </div>
      {enterprise && <EnterpriseNotice />}
      {enterprise && <p className="result-desc" role={completion.status === 'failed' ? 'alert' : 'status'}>{completion.message}</p>}

      <div className="work-area">
        <section className="found" aria-label="찾은 항목">
          <div className="found-head">
            <span className="found-title">찾은 항목</span>
            <span className="mono found-count">
              {enterprise ? `${matches.length}건 · 모두 고정` : `${selected.length} / ${matches.length} 선택`}
            </span>
          </div>

          {groups.map(({ id, items }) => {
            const indexes = items.map(({ i }) => i)
            const onCount = enterprise ? items.length : indexes.filter((i) => !off.has(i)).length
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
                  {enterprise ? <span className="group-num all fixed" aria-hidden="true">{ruleNum(id)}</span> : <button
                    type="button"
                    role="checkbox"
                    aria-checked={state === 'all' ? true : state === 'none' ? false : 'mixed'}
                    aria-label={`${ruleName(id)} 모두 선택`}
                    className={`group-num ${state}`}
                    onClick={() => toggleGroup(indexes)}
                  >
                    {ruleNum(id)}
                  </button>}
                  <span className="group-name">{ruleName(id)}</span>
                  {enterprise && <span className="enterprise-fixed">고정</span>}
                  <span className="mono group-count">
                    {state === 'all' ? items.length : `${onCount}/${items.length}`}
                  </span>
                </div>
                {open && (
                  <ul className="group-items">
                    {items.map(({ m, i }) => (
                      <li key={i}>
                        {enterprise ? <div className="item item-locked">
                          <span className={valueClass(m.ruleId)}>{text.slice(m.start, m.end)}</span>
                        </div> : <label className={`item ${off.has(i) ? 'off' : ''}`}>
                          <input
                            type="checkbox"
                            checked={!off.has(i)}
                            onChange={() => setOff(toggled(off, i))}
                          />
                          <span className={valueClass(m.ruleId)}>{text.slice(m.start, m.end)}</span>
                        </label>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}

          {manual.length > 0 && (
            <div className="group">
              <div className="group-head">
                <span className="group-num manual" aria-hidden>
                  +
                </span>
                <span className="group-name">직접 가린 부분</span>
                <span className="mono group-count">{manual.length}</span>
              </div>
              <ul className="group-items">
                {manual.map((r, k) => (
                  <li key={`${r.start}-${r.end}-${k}`} className="item manual-item">
                    <span className="manual-value">{text.slice(r.start, r.end)}</span>
                    <Button
                      variant="text"
                      className="manual-cancel"
                      aria-label={`${text.slice(r.start, r.end)} 가리기 취소`}
                      onClick={() => cancelManual(k)}
                    >
                      취소
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="doc">
          <div className="doc-col">
            <div className="doc-head">
              <h2 className="doc-title">원문</h2>
              <Button variant="text" className="doc-action" disabled={!pending} onClick={addManual}>
                선택한 부분 가리기
              </Button>
            </div>
            <form className="manual-form" onSubmit={addByText}>
              <label htmlFor="manual-query" className="manual-form-label">가릴 글자 입력</label>
              <input
                id="manual-query"
                ref={queryRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="예: 김민수"
                autoComplete="off"
              />
              <Button type="submit" variant="secondary" disabled={!query.trim()}>
                찾아서 가리기
              </Button>
            </form>
            <div ref={sourceRef} className="doc-text">
              {segments.map((s, k) =>
                s.range ? (
                  <mark key={k} className={`hit ${enterprise || !off.has(s.i!) ? 'on' : ''}`}>
                    <span className={valueClass(s.range.ruleId)}>{s.text}</span>
                    <RuleNum id={s.range.ruleId} />
                  </mark>
                ) : (
                  s.text
                ),
              )}
            </div>
          </div>
          <div className="doc-col">
            <div className="doc-head">
              <h2 className="doc-title">가린 결과</h2>
            </div>
            <div className="doc-text">
              {toSegments(masked, maskedRanges).map((s, k) =>
                s.range ? (
                  <span key={k} className="masked mono">
                    {s.text}
                  </span>
                ) : (
                  s.text
                ),
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
