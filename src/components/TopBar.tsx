import Button from './Button'
import type { CurrentUser } from '../api/auth'
import './TopBar.css'

interface TopBarProps {
  user: CurrentUser | null
  pending: boolean
  onLogin: () => void
  onLogout: () => void
  onDashboard: () => void
  onMasking: () => void
}

// 모든 화면 위에 붙는 상단 바. 서비스 로고와 현재 모드를 보여준다.
export default function TopBar({ user, pending, onLogin, onLogout, onDashboard, onMasking }: TopBarProps) {
  return (
    <header className="top-bar">
      <img className="service-name" src={`${import.meta.env.BASE_URL}logo.svg`} alt="가림" width={68} height={24} />
      <span className="mode-label">{user ? `${user.name} · ${user.role === 'admin' ? '관리자' : '직원'}` : '개인 모드'}</span>
      <div className="mode">
        {user ? <>
          <Button variant="text" onClick={onMasking} disabled={pending}>가리기</Button>
          {user.role === 'admin' && <Button variant="text" onClick={onDashboard} disabled={pending}>통계</Button>}
          <Button variant="text" onClick={onLogout} disabled={pending}>로그아웃</Button>
        </> : <Button variant="text" onClick={onLogin} disabled={pending}><span className="top-login-desktop">기업 계정으로 로그인</span><span className="top-login-mobile">로그인</span></Button>}
      </div>
    </header>
  )
}
