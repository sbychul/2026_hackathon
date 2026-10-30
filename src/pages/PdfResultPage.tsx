import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import PdfPreview from '../components/PdfPreview'
import EnterpriseNotice from '../components/enterprise/EnterpriseNotice'
import { selectAutomaticMatches, type MaskingMode } from '../components/enterprise/maskingPolicy'
import { RULE_ORDER, ruleName } from '../components/ruleDisplay'
import { RULES, type RuleId } from '../rules/rules'
import { extractPdf, type PdfText } from '../lib/pdf/extract'
import { detectPdf } from '../lib/pdf/result'
import RegionCoordinates from '../components/pdf/RegionCoordinates'
import { type ManualRegion } from '../lib/pdf/manualRegions'
import type { PdfMaskRegion } from '../lib/pdf/export'
import chevronDown from '../assets/pdf-chevron-down.svg'
import chevronRight from '../assets/pdf-chevron-right.svg'
import './ResultPage.css'
import './PdfResultPage.css'

interface PdfResultProps { file: File; onRestart: () => void; mode?: MaskingMode }

// 파일을 바꾸면 이전 문서의 선택과 다운로드 결과를 함께 폐기한다.
export default function PdfResultPage(props: PdfResultProps) {
  const identity = useMemo(() => ({ file: props.file, key: crypto.randomUUID() }), [props.file])
  return <PdfResultDocument key={identity.key} {...props} />
}

// 개인과 기업 모드에서 자동 탐지와 직접 영역을 함께 가린다.
function PdfResultDocument({ file, onRestart, mode = 'personal' }: PdfResultProps) {
  const [document, setDocument] = useState<{ file: File; bytes: Uint8Array; text: PdfText } | null>(null)
  const enterprise = mode === 'company'
  const [manual, setManual] = useState<ManualRegion[]>([])
  // 직접 영역 추가·취소 결과를 화면 읽기 프로그램에 알린다.
  const [notice, setNotice] = useState('')
  const manualHeading = useRef<HTMLHeadingElement>(null)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState('')
  const [off, setOff] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<RuleId>>(new Set(['card', 'address']))
  const [output, setOutput] = useState<{ blob: Blob; bytes: Uint8Array; regions: readonly PdfMaskRegion[] } | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // 화면 전환 뒤 제목에 초점을 옮겨 현재 위치를 안내한다.
  useEffect(() => titleRef.current?.focus({ preventScroll: true }), [])

  useEffect(() => {
    let cancelled = false
    // 원본은 메모리에서만 읽고, 글자가 없는 쪽은 안전하게 처리를 중단한다.
    const read = async () => {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer())
        const text = await extractPdf(bytes)
        if (text.emptyPages.length) {
          throw new Error(`${text.emptyPages.join(', ')}쪽에 읽을 수 있는 글자가 없어요. 스캔본은 지원하지 않아요. 글자가 들어 있는 PDF를 첨부해 주세요.`)
        }
        if (!cancelled) setDocument({ file, bytes, text })
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'PDF를 읽지 못했어요. 다른 파일을 첨부해 주세요.')
      }
    }
    void read()
    return () => { cancelled = true }
  }, [file])

  const matches = useMemo(() => document?.file === file ? detectPdf(document.text.pages) : [], [document, file])
  const selected = useMemo(() => selectAutomaticMatches(matches, off, mode), [matches, off, mode])
  const automatic = useMemo(() => selected.flatMap((match) => match.regions), [selected])
  const regions = useMemo(() => [...automatic, ...manual], [automatic, manual])
  const ready = !!document && document.file === file && output?.bytes === document.bytes && output.regions === regions && !editing

  // 직접 영역은 룰별 탐지 결과와 분리해 저장에만 합친다.
  const addManual = useCallback((region: ManualRegion) => {
    setManual((previous) => [...previous, region])
    setNotice(`${region.pageNumber}쪽에 직접 영역을 추가했어요.`)
  }, [])

  // 직접 영역을 취소하고, 사라진 취소 버튼 대신 목록 제목으로 초점을 옮긴다.
  const cancelManual = (id: string) => {
    setManual((previous) => previous.filter((item) => item.id !== id))
    setNotice('직접 영역을 취소했어요.')
    manualHeading.current?.focus()
  }
  const order = [...RULE_ORDER, ...RULES.map((rule) => rule.id).filter((id) => !RULE_ORDER.includes(id))]
  const groups = order.map((id) => ({ id, items: matches.map((match, i) => ({ match, i })).filter(({ match }) => match.ruleId === id) }))
    .filter(({ items }) => items.length)

  // 집합의 항목을 켜거나 끈 새 집합을 만든다.
  const toggle = <T,>(values: Set<T>, value: T) => {
    const next = new Set(values)
    if (!next.delete(value)) next.add(value)
    return next
  }

  // 한 종류의 항목을 모두 선택하거나 해제한다.
  const toggleGroup = (indexes: number[]) => {
    if (enterprise) return
    const allOn = indexes.every((i) => !off.has(i))
    const next = new Set(off)
    indexes.forEach((i) => allOn ? next.add(i) : next.delete(i))
    setOff(next)
  }

  // 미리보기가 완료된 선택과 파일을 함께 기억한다.
  const onReady = useCallback((blob: Blob, selectedRegions: readonly PdfMaskRegion[]) => {
    if (document) setOutput({ blob, bytes: document.bytes, regions: selectedRegions })
  }, [document])

  // 확인한 미리보기의 파일을 그대로 내려받는다.
  const download = () => {
    if (!ready || !output) return
    const url = URL.createObjectURL(output.blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.pdf$/i, '')}_가림.pdf`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <main className={`result-body pdf-result ${enterprise ? 'enterprise-page enterprise-result' : ''}`}>
      {enterprise && <p className="enterprise-eyebrow">기업 모드 · PDF 전체 가림</p>}
      <div className="result-head">
        <div>
          <h1 className="result-title" ref={titleRef} tabIndex={-1}>{error ? 'PDF를 확인해 주세요' : !document ? 'PDF를 읽고 있어요' : matches.length ? `${matches.length}건을 찾았어요` : '개인정보를 찾지 못했어요'}</h1>
          <p className="result-desc">{enterprise ? '기업 자동 탐지는 해제할 수 없어요. ' : '선택한 자동 탐지와 직접 영역을 함께 가려요. '}페이지를 그림으로 다시 만들어요. 내려받은 PDF에서는 원문을 복사할 수 없어요.</p>
        </div>
        <div className="result-actions">
          <Button variant="secondary" onClick={onRestart}>처음부터 다시</Button>
          <Button disabled={!ready} onClick={download}>가린 PDF 내려받기</Button>
        </div>
      </div>
      {enterprise && <EnterpriseNotice />}
      {error ? <p role="alert">{error}</p> : !document ? <p role="status">파일의 글자와 위치를 확인하고 있어요…</p> : (
        <div className="work-area">
          <section className="found" aria-label="찾은 항목">
            <div className="found-head">
              <span className="found-title">찾은 항목</span>
              <span className="mono found-count">{enterprise ? `${matches.length}건 · 모두 고정` : `${selected.length} / ${matches.length} 선택`}</span>
            </div>
            {groups.map(({ id, items }) => {
              const indexes = items.map(({ i }) => i)
              const count = enterprise ? items.length : indexes.filter((i) => !off.has(i)).length
              const state = count === items.length ? 'all' : count === 0 ? 'none' : 'some'
              const open = !collapsed.has(id)
              return (
                <div key={id} className="group">
                  <div className={`group-head ${open ? '' : 'closed'}`}>
                    <button type="button" className="group-toggle" aria-expanded={open} aria-label={`${ruleName(id)} ${open ? '접기' : '펼치기'}`} onClick={() => setCollapsed(toggle(collapsed, id))}>
                      <img src={open ? chevronDown : chevronRight} width={16} height={16} alt="" />
                    </button>
                    {enterprise ? <span className="group-num all fixed" aria-hidden="true">{order.indexOf(id) + 1}</span> : <button type="button" role="checkbox" aria-checked={state === 'some' ? 'mixed' : state === 'all'} aria-label={`${ruleName(id)} 모두 선택`} disabled={editing} className={`group-num ${state}`} onClick={() => toggleGroup(indexes)}>{order.indexOf(id) + 1}</button>}
                    <span className="group-name">{ruleName(id)}</span>
                    {enterprise && <span className="enterprise-fixed">고정</span>}
                    <span className="mono group-count">{state === 'all' ? items.length : `${count}/${items.length}`}</span>
                  </div>
                  {open && <ul className="group-items">{items.map(({ match, i }) => (
                    <li key={i}>
                      {enterprise ? <div className="item item-locked">
                        <span className={['name', 'address'].includes(id) ? '' : 'mono'}>{match.value}</span>
                        <span className="pdf-item-page">{match.pageNumber}쪽</span>
                      </div> : <label className={`item ${off.has(i) ? 'off' : ''}`}>
                        <input type="checkbox" disabled={editing} checked={!off.has(i)} onChange={() => setOff(toggle(off, i))} />
                        <span className={['name', 'address'].includes(id) ? '' : 'mono'}>{match.value}</span>
                        <span className="pdf-item-page">{match.pageNumber}쪽</span>
                      </label>}
                    </li>
                  ))}</ul>}
                </div>
              )
            })}
            {!matches.length && <p className="result-desc">찾은 항목이 없어요. 미리보기에서 문서를 확인해 주세요.</p>}
            <div className="pdf-manual-list">
              <h2 ref={manualHeading} tabIndex={-1}>직접 추가 · {manual.length}개</h2>
              <p className="visually-hidden" role="status">{notice}</p>
              {manual.map((region, index) => <article key={region.id} className="pdf-manual-item">
                <h3>영역 {index + 1} · {region.pageNumber}쪽</h3>
                <p>왼쪽 {Math.round(region.x)} · 위쪽 {Math.round(region.y)} · {Math.round(region.width)} × {Math.round(region.height)}</p>
                <Button variant="secondary" disabled={editing} aria-label={`영역 ${index + 1} 취소`} onClick={() => cancelManual(region.id)}>이 영역 취소</Button>
              </article>)}
              <p>직접 가린 영역은 탐지 통계에 포함하지 않아요.</p>
              <RegionCoordinates pages={document.text.pages} onAdd={addManual} disabled={editing} />
            </div>
          </section>
          <PdfPreview bytes={document.bytes} regions={regions} filename={file.name} pageCount={document.text.pages.length} onReady={onReady} automatic={automatic} manual={manual} onAdd={addManual} onEditingChange={setEditing} />
        </div>
      )}
    </main>
  )
}
