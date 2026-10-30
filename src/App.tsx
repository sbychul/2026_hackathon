import { useEffect, useState, type AnimationEvent } from 'react'
import TopBar from './components/TopBar'
import Spinner from './components/Spinner'
import MainPage from './pages/MainPage'
import ResultPage from './pages/ResultPage'
import PdfResultPage from './pages/PdfResultPage'
import AdminPage from './pages/AdminPage'
import './App.css'

type View = 'input' | 'loading' | 'result'

// 앱 최상위 컴포넌트. 화면이 위로 사라졌다가 다음 화면이 위로 들어오게 전환한다.
export default function App() {
  const [view, setView] = useState<View>('input')
  const [text, setText] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [admin, setAdmin] = useState(() => window.location.hash === '#admin')

  useEffect(() => {
    // 직접 주소 진입과 뒤로 가기에도 관리자 화면 자체의 권한 검사를 적용한다.
    const update = () => setAdmin(window.location.hash === '#admin')
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  // 원문 상태는 보존한 채 마스킹과 관리자 통계 사이를 이동한다.
  const navigateAdmin = (next: boolean) => {
    setLeaving(false)
    window.location.hash = next ? 'admin' : ''
    setAdmin(next)
  }

  // 찾을 글을 받고 입력 화면을 내보낸다.
  const find = (value: string) => {
    setPdf(null)
    setText(value)
    setLeaving(true)
  }

  // 첨부한 PDF를 결과 화면으로 넘긴다.
  const findPdf = (file: File) => {
    setPdf(file)
    setLeaving(true)
  }

  // 나가는 애니메이션이 끝나면 다음 화면으로 바꾼다.
  const handleAnimationEnd = async (e: AnimationEvent) => {
    if (e.target !== e.currentTarget || !leaving) return
    setLeaving(false)
    if (view === 'result') {
      setPdf(null)
      setView('input')
      return
    }
    setView('loading')
    // 입력 화면 전환 뒤 결과 화면이 파일 읽기 상태를 직접 안내한다.
    await Promise.resolve()
    setView('result')
  }

  return (
    <div className="app">
      <TopBar onAdmin={() => navigateAdmin(true)} onMasking={() => navigateAdmin(false)} isAdminPage={admin} />
      {admin ? <AdminPage onBack={() => navigateAdmin(false)} /> : <div key={view} className={`stage ${leaving ? 'leave' : 'enter'}`} onAnimationEnd={handleAnimationEnd}>
        {view === 'input' && <MainPage onFind={find} onFindPdf={findPdf} />}
        {view === 'loading' && <Spinner />}
        {view === 'result' && (pdf
          ? <PdfResultPage file={pdf} onRestart={() => setLeaving(true)} />
          : <ResultPage text={text} onRestart={() => setLeaving(true)} />)}
      </div>}
    </div>
  )
}
