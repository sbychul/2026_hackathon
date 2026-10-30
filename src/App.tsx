import { useState, type AnimationEvent } from 'react'
import TopBar from './components/TopBar'
import Spinner from './components/Spinner'
import Button from './components/Button'
import MainPage from './pages/MainPage'
import ResultPage from './pages/ResultPage'
import PdfResultPage from './pages/PdfResultPage'
import LoginPage from './pages/LoginPage'
import AdminPage from './pages/AdminPage'
import { useSession } from './auth/useSession'
import { getMaskingMode, type MaskingMode } from './components/enterprise/maskingPolicy'
import { applyCustomWords } from './api/customWords'
import { applyRuleLocks } from './api/ruleLocks'
import './App.css'

type View = 'input' | 'loading' | 'result'

// 사용자 역할을 확인하고 로그인·개인 사용·관리자 진입을 연결한다.
export default function App() {
  const auth = useSession()
  const [personal, setPersonal] = useState(false)
  const [dashboard, setDashboard] = useState(false)
  const user = auth.user

  // 로그인에 성공하면 기업 입력 화면으로 이동한다.
  async function signIn(input: Parameters<typeof auth.signIn>[0]) {
    const success = await auth.signIn(input)
    if (success) { setPersonal(false); setDashboard(false) }
    return success
  }

  // 로그아웃에 성공하면 로그인 화면으로 돌아간다.
  async function signOut() {
    if (await auth.signOut()) { setPersonal(false); setDashboard(false) }
  }

  // 프로필 조회에 실패한 세션도 정리해 개인 사용에 기업 로그인이 남지 않게 한다.
  async function enterPersonal() {
    if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
      if (!await auth.signOut()) return
    }
    auth.clearError()
    setPersonal(true)
    setDashboard(false)
  }

  // 서버 프로필이 관리자인 경우에만 통계 진입을 허용한다.
  async function openDashboard() {
    await auth.refresh()
    setDashboard(true)
  }

  const showLogin = !user && !personal
  return (
    <div className="app">
      <TopBar user={user} pending={auth.pending} onLogin={() => setPersonal(false)} onLogout={() => void signOut()} onDashboard={() => void openDashboard()} onMasking={() => setDashboard(false)} />
      {showLogin ? <LoginPage pending={auth.pending} error={auth.error} onLogin={signIn} onPersonal={() => void enterPersonal()} /> : <>
        {auth.error && <p role="alert">{auth.error}</p>}
        {auth.pending && <div className="login-loading" role="status">
          <span className="spinner" aria-hidden />
          <p>로그인 상태를 확인하고 있어요…</p>
        </div>}
        <div hidden={auth.pending} style={auth.pending ? undefined : { display: 'flex', flexDirection: 'column', flex: 1 }}>
          {dashboard && user?.role === 'admin'
            ? <AdminPage onBack={() => setDashboard(false)} />
            : <MaskingWorkspace key={`${auth.revision}-${personal}`} mode={getMaskingMode(user?.role ?? 'personal')} />}
        </div>
      </>}
    </div>
  )
}

// 확인된 역할을 입력·결과 화면에 전달하고 사용자가 바뀌면 원문을 초기화한다.
function MaskingWorkspace({ mode }: { mode: MaskingMode }) {
  const [view, setView] = useState<View>('input')
  const [text, setText] = useState('')
  const [pdf, setPdf] = useState<File | null>(null)
  const [leaving, setLeaving] = useState(false)
  const [wordsFailed, setWordsFailed] = useState(false)

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
    await showResult()
  }

  // 최신 기업 공통 단어와 고정 설정을 넣은 뒤 결과를 보여준다. 기업 모드에서 조회에 실패하면 결과를 보여주지 않는다.
  const showResult = async () => {
    setWordsFailed(false)
    setView('loading')
    try {
      await Promise.all([applyCustomWords(mode === 'company'), applyRuleLocks(mode === 'company')])
    } catch {
      setWordsFailed(true)
      return
    }
    setView('result')
  }

  return (
      <div key={view} className={`stage ${leaving ? 'leave' : 'enter'}`} onAnimationEnd={handleAnimationEnd}>
        {view === 'input' && <MainPage mode={mode} onFind={find} onFindPdf={findPdf} />}
        {view === 'loading' && (wordsFailed
          ? <section className="words-error" role="alert">
            <h2>기업 가림 설정을 불러오지 못했어요</h2>
            <p>공통 단어와 고정 설정이 빠진 결과는 보여드리지 않아요. 연결을 확인하고 다시 시도해 주세요.</p>
            <div className="words-error-actions">
              <Button onClick={() => void showResult()}>다시 시도</Button>
              <Button variant="secondary" onClick={() => { setWordsFailed(false); setView('input') }}>처음으로</Button>
            </div>
          </section>
          : <Spinner />)}
        {view === 'result' && (pdf
          ? <PdfResultPage mode={mode} file={pdf} onRestart={() => setLeaving(true)} />
          : <ResultPage mode={mode} text={text} onRestart={() => setLeaving(true)} />)}
      </div>
  )
}
