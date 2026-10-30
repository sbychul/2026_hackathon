import { useRef, useState, type DragEvent } from 'react'
import Button from '../components/Button'
import RuleNum from '../components/RuleNum'
import { RULE_ORDER, ruleName } from '../components/ruleDisplay'
import lockIcon from '../assets/lock.svg'
import clipIcon from '../assets/clip.svg'
import './MainPage.css'

// 메인(입력) 화면. 글을 붙여넣거나 PDF를 골라 개인정보 찾기를 시작한다.
export default function MainPage({ onFind }: { onFind: (text: string) => void }) {
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
    setText('')
    setPdf(file)
  }

  // 입력창에 끌어다 놓은 파일을 받는다.
  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    pickFile(e.dataTransfer.files[0])
  }

  // 글이 있으면 결과 화면으로 넘긴다. PDF 탐지는 아직 연결 전이다.
  const handleFind = () => {
    if (text) onFind(text)
    else alert('PDF 탐지는 아직 준비 중이에요.')
  }

  return (
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
            onChange={(e) => {
              setText(e.target.value)
              setPdf(null)
            }}
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
              <Button disabled={!text} onClick={handleFind}>
                개인정보 찾기
              </Button>
            </div>
          </div>
        </div>

        <div className="rules">
          <span className="rules-label">찾는 항목</span>
          {RULE_ORDER.map((id) => (
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
