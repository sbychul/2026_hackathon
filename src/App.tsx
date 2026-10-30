import { useState, type AnimationEvent } from 'react'
import TopBar from './components/TopBar'
import Spinner from './components/Spinner'
import MainPage from './pages/MainPage'
import ResultPage from './pages/ResultPage'
import './App.css'

type View = 'input' | 'loading' | 'result'

// 앱 최상위 컴포넌트. 화면이 위로 사라졌다가 다음 화면이 위로 들어오게 전환한다.
export default function App() {
  const [view, setView] = useState<View>('input')
  const [text, setText] = useState('')
  const [leaving, setLeaving] = useState(false)

  // 찾을 글을 받고 입력 화면을 내보낸다.
  const find = (value: string) => {
    setText(value)
    setLeaving(true)
  }

  // 나가는 애니메이션이 끝나면 다음 화면으로 바꾼다.
  const handleAnimationEnd = async (e: AnimationEvent) => {
    if (e.target !== e.currentTarget || !leaving) return
    setLeaving(false)
    if (view === 'result') {
      setView('input')
      return
    }
    setView('loading')
    // 텍스트 탐지는 바로 끝나서 로딩 화면이 거의 보이지 않는다. PDF 탐지 연결 뒤 대기 시간을 사용한다.
    await Promise.resolve()
    setView('result')
  }

  return (
    <div className="app">
      <TopBar />
      <div key={view} className={`stage ${leaving ? 'leave' : 'enter'}`} onAnimationEnd={handleAnimationEnd}>
        {view === 'input' && <MainPage onFind={find} />}
        {view === 'loading' && <Spinner />}
        {view === 'result' && <ResultPage text={text} onRestart={() => setLeaving(true)} />}
      </div>
    </div>
  )
}
