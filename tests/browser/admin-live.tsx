import { useState, type SubmitEvent } from 'react'
import { createRoot } from 'react-dom/client'
import { login, logout } from '../../src/api/auth'
import AdminPage from '../../src/pages/AdminPage'
import Button from '../../src/components/Button'
import '../../src/index.css'

// 로그인 화면 이슈와 독립적으로 실제 계정의 통계·접근 차단을 검사한다.
export default function LiveCheck() {
  const [message, setMessage] = useState('실제 조회 검증용 화면이에요. 입력한 비밀번호는 저장하거나 출력하지 않아요.')
  const [version, setVersion] = useState(0)
  const [pending, setPending] = useState(false)
  // 전달받은 시연 계정으로 로그인하고 실제 제품의 관리자 화면을 다시 확인한다.
  const signIn = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (pending) return
    const form = event.currentTarget
    const fields = new FormData(form)
    setPending(true)
    try {
      const user = await login({ email: String(fields.get('email')), password: String(fields.get('password')) })
      setMessage(`${user.name} · ${user.role === 'admin' ? '관리자' : '직원'} 로그인 완료`)
      form.reset()
      setVersion((value) => value + 1)
    } catch { setMessage('로그인에 실패했어요. 시연 계정을 확인해 주세요.') }
    finally { setPending(false) }
  }
  // 실제 브라우저 세션을 종료하여 열려 있는 통계가 지워지는지 확인한다.
  const signOut = async () => {
    try { await logout(); setMessage('로그아웃했어요.'); setVersion((value) => value + 1) }
    catch { setMessage('로그아웃에 실패했어요.') }
  }
  return <>
    <form onSubmit={signIn} className="admin-panel" aria-label="검증용 로그인">
      <p role="status">{message}</p>
      <label>이메일 <input name="email" type="email" required autoComplete="username" /></label>
      <label>비밀번호 <input name="password" type="password" required autoComplete="current-password" /></label>
      <Button type="submit" disabled={pending}>검증 계정 로그인</Button>
      <Button variant="secondary" onClick={() => void signOut()}>로그아웃</Button>
    </form>
    <AdminPage key={version} onBack={() => { window.location.href = '/' }} />
  </>
}

if (import.meta.env.DEV) createRoot(document.getElementById('root')!).render(<LiveCheck />)
