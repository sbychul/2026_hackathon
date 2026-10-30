import { useEffect, useRef, useState, type FormEvent } from 'react'
import Button from '../components/Button'
import type { LoginInput } from '../api/auth'
import './LoginPage.css'

interface LoginPageProps {
  pending: boolean
  error: string
  onLogin: (input: LoginInput) => Promise<boolean>
  onPersonal: () => void
}

// 기업 로그인과 기록 없는 개인 사용 진입을 제공한다.
export default function LoginPage({ pending, error, onLogin, onPersonal }: LoginPageProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const errorRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => { if (error) errorRef.current?.focus() }, [error])

  // 입력한 비밀번호를 저장하거나 기록하지 않고 로그인 함수로 넘긴다.
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    if (await onLogin({ email: email.trim(), password })) setPassword('')
  }

  return (
    <main className="login-page">
      <p className="login-kicker"><span className="login-desktop">이슈 35 · 로그인</span><span className="login-mobile">이슈 35·41</span></p>
      <h1><span className="login-desktop">안전한 공유를 시작해요</span><span className="login-mobile">공유 전에 안전하게</span></h1>
      <p className="login-intro"><span className="login-desktop">기업 계정으로 로그인하거나, 로그인 없이 개인으로 사용할 수 있어요.</span><span className="login-mobile">기업 계정으로 로그인해 주세요.</span></p>
      <div className="login-layout">
        <form className="login-form" onSubmit={submit} aria-busy={pending}>
          <h2 className="login-desktop">기업 계정으로 로그인</h2>
          <p className="login-desktop">관리자가 발급한 계정으로 로그인해 주세요.</p>
          <label className="login-field">회사 이메일
            <input type="email" name="email" autoComplete="username" placeholder="이메일을 입력해 주세요" value={email} onChange={event => setEmail(event.target.value)} required disabled={pending} />
          </label>
          <label className="login-field">비밀번호
            <input type="password" name="password" autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" value={password} onChange={event => setPassword(event.target.value)} required disabled={pending} />
          </label>
          {error && <p className="login-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
          <Button type="submit" disabled={pending}>{pending ? '확인 중…' : '로그인'}</Button>
          <hr className="login-desktop" />
          <Button variant="secondary" onClick={onPersonal} disabled={pending}>개인으로 사용하기</Button>
          <p className="login-footnote login-desktop">개인 모드는 로그인 없이 사용하며 탐지 기록을 남기지 않아요.</p>
        </form>
        <aside className="login-guide login-desktop">
          <h2>원문은 내 브라우저 안에</h2>
          <p>문서와 텍스트는 전송하지 않아요.<br />기업에서는 보안 교육을 위해 탐지 건수만 기록해요.</p>
          <section><h3>직원</h3><p>관리자가 고정한 항목은 반드시 가려져요. 나머지는 직접 선택하고, 놓친 부분도 추가로 가릴 수 있어요.</p></section>
          <section><h3>관리자</h3><p>같은 가리기 기능과 이름·건수만 보이는 통계를 사용할 수 있어요.</p></section>
        </aside>
        <aside className="login-mobile login-mobile-guide"><h2>원문은 브라우저 안에</h2><p>개인 사용은 기록을 남기지 않아요. 기업 사용은 탐지 건수만 기록해요.</p></aside>
      </div>
    </main>
  )
}
