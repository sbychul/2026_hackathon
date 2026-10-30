import Button from './Button'
import './TopBar.css'

// 모든 화면 위에 붙는 상단 바. 서비스 이름과 현재 모드를 보여준다.
export default function TopBar() {
  return (
    <header className="top-bar">
      <span className="service-name">서비스 이름</span>
      <div className="mode">
        <span className="mode-label">개인 모드</span>
        <span className="mode-divider" aria-hidden />
        <Button variant="text">기업 계정으로 로그인</Button>
      </div>
    </header>
  )
}
