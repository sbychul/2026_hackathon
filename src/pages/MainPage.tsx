import { useRef, useState, type DragEvent } from 'react'
import Button from '../components/Button'
import { RULES, type RuleId } from '../rules/rules'
import lockIcon from '../assets/lock.svg'
import clipIcon from '../assets/clip.svg'
import './MainPage.css'

// 시안에 나오는 찾는 항목 순서
const RULE_ORDER: RuleId[] = ['name', 'rrn', 'phone', 'email', 'card', 'address']
const ruleName = (id: RuleId) => RULES.find((r) => r.id === id)!.name

// 메인(입력) 화면. 글을 붙여넣거나 PDF를 골라 개인정보 찾기를 시작한다.
export default function MainPage() {
  const [text, setText] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

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

  return (
    <div className="main-page">
      <header className="top-bar">
        <span className="service-name">서비스 이름</span>
        <div className="mode">
          <span className="mode-label">개인 모드</span>
          <span className="mode-divider" aria-hidden />
          <Button variant="text">기업 계정으로 로그인</Button>
        </div>
      </header>

      <main className="main-body">
        <div className="center-col">
          <h1 className="title">개인정보 가리기</h1>
          <p className="desc">
            <img src={lockIcon} width={15} height={15} alt="" />
            넣은 글과 파일은 이 브라우저 밖으로 나가지 않아요.
          </p>

          <div className="input-box" onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            <textarea
              className="input-text"
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="여기에 글을 붙여넣거나 PDF를 끌어다 놓으세요"
              aria-label="개인정보를 찾을 글"
            />
            <div className="tool-row">
              <button type="button" className="attach" onClick={() => fileInput.current?.click()}>
                <img src={clipIcon} width={18} height={18} alt="" />
                PDF 첨부
              </button>
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
                <span className="count">{pdf ? pdf.name : `${text.length}자`}</span>
                {/* ponytail: 탐지 연결은 별도 이슈. 지금은 버튼 상태만 맞춘다. */}
                <Button disabled={!text && !pdf}>개인정보 찾기</Button>
              </div>
            </div>
          </div>

          <div className="rules">
            <span className="rules-label">찾는 항목</span>
            {RULE_ORDER.map((id, i) => (
              <span key={id} className="rule">
                <span className="rule-num" aria-hidden>
                  {i + 1}
                </span>
                {ruleName(id)}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
