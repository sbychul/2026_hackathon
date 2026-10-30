import { useEffect, useRef, useState, type DragEvent } from 'react'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import Button from '../components/Button'
import RuleNum from '../components/RuleNum'
import EnterpriseNotice from '../components/enterprise/EnterpriseNotice'
import { type MaskingMode } from '../components/enterprise/maskingPolicy'
import { RULE_ORDER, ruleName } from '../components/ruleDisplay'
import lockIcon from '../assets/lock.svg'
import clipIcon from '../assets/clip.svg'
import pdfIcon from '../assets/pdf-file.svg'
import closeIcon from '../assets/close.svg'
import './MainPage.css'

// 메인(입력) 화면. 글을 붙여넣거나 PDF를 골라 개인정보 찾기를 시작한다.
export default function MainPage({ onFind, onFindPdf, mode = 'personal' }: { onFind: (text: string) => void; onFindPdf: (file: File) => void; mode?: MaskingMode }) {
  const enterprise = mode === 'company'
  const [text, setText] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [pageCount, setPageCount] = useState<{ file: File; count: number } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // 결과 화면에서 돌아오면 초점을 제목으로 옮겨 사라진 버튼에 초점이 남지 않게 한다.
  useEffect(() => titleRef.current?.focus({ preventScroll: true }), [])

  useEffect(() => {
    if (!pdf) return
    let cancelled = false
    // 첨부 카드에 표시할 쪽수만 읽고 문서 자원을 해제한다.
    const readCount = async () => {
      const bytes = new Uint8Array(await pdf.arrayBuffer())
      if (cancelled) return
      const task = pdfjs.getDocument({ data: bytes })
      try {
        const doc = await task.promise
        if (!cancelled) setPageCount({ file: pdf, count: doc.numPages })
      } finally {
        await task.destroy()
      }
    }
    // 읽기 오류는 개인정보 찾기를 누른 뒤 결과 화면에서 자세히 안내한다.
    void readCount().catch(() => {})
    return () => { cancelled = true }
  }, [pdf])

  // PDF만 받고, 다른 파일이면 팝업으로 막는다.
  const pickFile = (file: File | undefined) => {
    if (!file) return
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      alert('PDF 외의 파일 첨부는 불가능합니다.')
      return
    }
    setPdf(file)
  }

  // 입력창에 끌어다 놓은 파일을 받는다.
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    pickFile(e.dataTransfer.files[0])
  }

  // 첨부 파일이 있으면 PDF를 우선 처리하고, 없으면 입력한 글을 넘긴다.
  const handleFind = () => {
    if (pdf) onFindPdf(pdf)
    else if (text) onFind(text)
  }

  return (
    <main className={`main-body ${enterprise ? 'enterprise-page enterprise-input' : ''}`}>
      <div className="center-col">
        {enterprise && <p className="enterprise-eyebrow">기업 모드 · 개인정보 가리기</p>}
        <h1 className="title" ref={titleRef} tabIndex={-1}>{enterprise ? '공유 전에 개인정보를 가려요' : '민감한 정보를 가려요'}</h1>
        <p className="desc">
          <img src={lockIcon} width={15} height={15} alt="" />
          넣은 글과 파일은 이 브라우저 밖으로 나가지 않아요.
        </p>
        {enterprise && <EnterpriseNotice />}

        <div className={`input-box ${pdf ? 'has-pdf' : ''}`} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
          {enterprise && <div className="enterprise-input-head">
            <h2>내용 입력</h2>
            <p>자동으로 찾은 항목은 모두 가려져요. 결과 화면에서 가려진 내용을 확인해 주세요.</p>
            <div className="enterprise-input-tabs" role="group" aria-label="입력 방식">
              <Button variant={pdf ? 'secondary' : 'primary'} aria-pressed={!pdf} onClick={() => setPdf(null)}>텍스트</Button>
              <Button variant={pdf ? 'primary' : 'secondary'} aria-pressed={!!pdf} onClick={() => fileInput.current?.click()}>문서 첨부</Button>
            </div>
          </div>}
          {pdf && <div className="pdf-attachment">
            <div className="pdf-chip">
              <img src={pdfIcon} width={28} height={28} alt="" />
              <div className="pdf-info">
                <span className="pdf-name" title={pdf.name}>{pdf.name}</span>
                <span className="pdf-size">PDF · {pageCount?.file === pdf ? `${pageCount.count}쪽 · ` : ''}{Math.ceil(pdf.size / 1024)}KB</span>
              </div>
              <button type="button" className="pdf-remove" aria-label="PDF 첨부 제거" onClick={() => setPdf(null)}>
                <img src={closeIcon} width={14} height={14} alt="" />
              </button>
            </div>
          </div>}
          <textarea
            className="input-text"
            rows={1}
            value={pdf ? '' : text}
            disabled={!!pdf}
            onChange={(e) => setText(e.target.value)}
            placeholder={pdf ? 'PDF를 첨부하면 글자는 따로 넣지 않아도 돼요.' : '여기에 글을 붙여넣거나 PDF를 끌어다 놓으세요'}
            aria-label="개인정보를 찾을 글"
          />
          <div className="tool-row">
            {enterprise ? <span className="enterprise-input-help">원문과 파일은 브라우저 밖으로 나가지 않아요.</span> : <button type="button" className="attach" onClick={() => fileInput.current?.click()}>
              <img src={clipIcon} width={18} height={18} alt="" />
              PDF 첨부
            </button>}
            <input
              ref={fileInput}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                pickFile(e.target.files?.[0])
                // 같은 파일을 다시 골라도 onChange가 불리게 비운다.
                e.target.value = ''
              }}
            />
            <div className="run">
              <span className="count">{pdf ? pageCount?.file === pdf ? `${pageCount.count}쪽` : 'PDF 첨부됨' : `${text.length}자`}</span>
              <Button disabled={!text && !pdf} onClick={handleFind}>
                개인정보 찾기
              </Button>
            </div>
          </div>
        </div>

        <div className="rules">
          <span className="rules-label">찾는 항목</span>
          {RULE_ORDER.filter((id) => enterprise || id !== 'custom').map((id) => (
            <span key={id} className="rule">
              <RuleNum id={id} />
              {ruleName(id)}
            </span>
          ))}
        </div>
      </div>
    </main>
  )
}
