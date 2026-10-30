import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Button from '../components/Button'
import PdfPreview from '../components/PdfPreview'
import { RULE_ORDER, ruleName } from '../components/ruleDisplay'
import { RULES, type RuleId } from '../rules/rules'
import { extractPdf, type PdfText } from '../lib/pdf/extract'
import { detectPdf } from '../lib/pdf/result'
import type { PdfMaskRegion } from '../lib/pdf/export'
import chevronDown from '../assets/pdf-chevron-down.svg'
import chevronRight from '../assets/pdf-chevron-right.svg'
import './ResultPage.css'
import './PdfResultPage.css'

// PDF를 읽고 개인 모드에서 고른 항목만 가린 뒤 결과를 확인하게 한다.
export default function PdfResultPage({ file, onRestart }: { file: File; onRestart: () => void }) {
  const [document, setDocument] = useState<{ bytes: Uint8Array; text: PdfText } | null>(null)
  const [error, setError] = useState('')
  const [off, setOff] = useState<Set<number>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<RuleId>>(new Set(['card', 'address']))
  const [output, setOutput] = useState<{ blob: Blob; regions: readonly PdfMaskRegion[] } | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // 화면이 바뀌면 초점을 제목으로 옮겨 키보드·화면 읽기 사용자가 위치를 잃지 않게 한다.
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
        if (!cancelled) setDocument({ bytes, text })
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'PDF를 읽지 못했어요. 다른 파일을 첨부해 주세요.')
      }
    }
    void read()
    return () => { cancelled = true }
  }, [file])

  const matches = useMemo(() => document ? detectPdf(document.text.pages) : [], [document])
  const regions = useMemo(() => matches.flatMap((match, i) => off.has(i) ? [] : match.regions), [matches, off])
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
    const allOn = indexes.every((i) => !off.has(i))
    const next = new Set(off)
    indexes.forEach((i) => allOn ? next.add(i) : next.delete(i))
    setOff(next)
  }

  // 미리보기가 완료된 선택과 파일을 함께 기억한다.
  const onReady = useCallback((blob: Blob, selectedRegions: readonly PdfMaskRegion[]) => {
    setOutput({ blob, regions: selectedRegions })
  }, [])

  // 확인한 미리보기의 파일을 그대로 내려받는다.
  const download = () => {
    if (!output || output.regions !== regions) return
    const url = URL.createObjectURL(output.blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = `${file.name.replace(/\.pdf$/i, '')}_가림.pdf`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <main className="result-body pdf-result">
      <div className="result-head">
        <div>
          <h1 className="result-title" ref={titleRef} tabIndex={-1}>{error ? 'PDF를 확인해 주세요' : !document ? 'PDF를 읽고 있어요' : matches.length ? `${matches.length}건을 찾았어요` : '개인정보를 찾지 못했어요'}</h1>
          <p className="result-desc">체크한 항목은 검게 덮고 페이지를 그림으로 다시 만들어요. 내려받은 PDF에서는 원문을 복사할 수 없어요.</p>
        </div>
        <div className="result-actions">
          <Button variant="secondary" onClick={onRestart}>처음부터 다시</Button>
          <Button disabled={!output || output.regions !== regions} onClick={download}>가린 PDF 내려받기</Button>
        </div>
      </div>
      {error ? <p role="alert">{error}</p> : !document ? <p role="status">파일의 글자와 위치를 확인하고 있어요…</p> : (
        <div className="work-area">
          <section className="found" aria-label="찾은 항목">
            <div className="found-head">
              <span className="found-title">찾은 항목</span>
              <span className="mono found-count">{matches.length - off.size} / {matches.length} 선택</span>
            </div>
            {groups.map(({ id, items }) => {
              const indexes = items.map(({ i }) => i)
              const count = indexes.filter((i) => !off.has(i)).length
              const state = count === items.length ? 'all' : count === 0 ? 'none' : 'some'
              const open = !collapsed.has(id)
              return (
                <div key={id} className="group">
                  <div className={`group-head ${open ? '' : 'closed'}`}>
                    <button type="button" className="group-toggle" aria-expanded={open} aria-label={`${ruleName(id)} ${open ? '접기' : '펼치기'}`} onClick={() => setCollapsed(toggle(collapsed, id))}>
                      <img src={open ? chevronDown : chevronRight} width={16} height={16} alt="" />
                    </button>
                    <button type="button" role="checkbox" aria-checked={state === 'some' ? 'mixed' : state === 'all'} aria-label={`${ruleName(id)} 모두 선택`} className={`group-num ${state}`} onClick={() => toggleGroup(indexes)}>{order.indexOf(id) + 1}</button>
                    <span className="group-name">{ruleName(id)}</span>
                    <span className="mono group-count">{state === 'all' ? items.length : `${count}/${items.length}`}</span>
                  </div>
                  {open && <ul className="group-items">{items.map(({ match, i }) => (
                    <li key={i}>
                      <label className={`item ${off.has(i) ? 'off' : ''}`}>
                        <input type="checkbox" checked={!off.has(i)} onChange={() => setOff(toggle(off, i))} />
                        <span className={['name', 'address'].includes(id) ? '' : 'mono'}>{match.value}</span>
                        <span className="pdf-item-page">{match.pageNumber}쪽</span>
                      </label>
                    </li>
                  ))}</ul>}
                </div>
              )
            })}
            {!matches.length && <p className="result-desc">찾은 항목이 없어요. 미리보기에서 문서를 확인해 주세요.</p>}
          </section>
          <PdfPreview bytes={document.bytes} regions={regions} filename={file.name} pageCount={document.text.pages.length} onReady={onReady} />
        </div>
      )}
    </main>
  )
}
