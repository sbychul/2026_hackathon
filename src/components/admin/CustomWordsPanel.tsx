import { useEffect, useState, type FormEvent } from 'react'
import Button from '../Button'
import { addCustomWord, deleteCustomWord, listCustomWords, type CustomWord } from '../../api/customWords'

type LoadState = 'loading' | 'error' | 'ready'

// 관리자가 기업 공통 가림 단어를 조회·추가·삭제하는 화면.
export default function CustomWordsPanel() {
  const [load, setLoad] = useState<LoadState>('loading')
  const [words, setWords] = useState<CustomWord[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // 등록된 단어 목록을 다시 불러온다.
  function reload() {
    setLoad('loading')
    listCustomWords().then((list) => { setWords(list); setLoad('ready') }, () => setLoad('error'))
  }

  useEffect(reload, [])

  // 입력한 단어를 저장하고 실패하면 입력값을 유지한다.
  async function save(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveError('')
    try {
      const added = await addCustomWord(input, words)
      setWords((list) => [...list, added])
      setInput('')
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '단어를 저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  // 확인한 단어를 삭제하고 실패하면 목록을 그대로 둔다.
  async function remove(id: string) {
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteCustomWord(id)
      setWords((list) => list.filter((item) => item.id !== id))
      setConfirmId(null)
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '단어를 삭제하지 못했어요.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <section className="admin-panel">
        <h2>관리자만 추가·삭제할 수 있어요</h2>
        <p>직원은 등록된 단어를 확인할 수 있지만, 단어를 삭제하거나 적용을 해제할 수 없어요.</p>
      </section>
      <form className="admin-panel custom-word-form" onSubmit={(e) => void save(e)}>
        <h2>새 가림 단어</h2>
        <p>가릴 단어 또는 문구를 입력해 주세요. 부분 일치로 찾고, 영문 대소문자는 구분하지 않아요.</p>
        <label htmlFor="custom-word-input">가릴 단어</label>
        <input id="custom-word-input" value={input} maxLength={100} placeholder="예: 가상프로젝트명" onChange={(e) => setInput(e.target.value)} aria-invalid={!!saveError} aria-describedby={saveError ? 'custom-word-error' : undefined} />
        {saveError && <p id="custom-word-error" className="custom-word-error" role="alert">{saveError} 입력한 단어는 그대로 있어요.</p>}
        <Button type="submit" disabled={saving || !input.trim()}>{saving ? '저장 중…' : '기업 공통 단어로 저장'}</Button>
      </form>
      <section className="admin-panel" aria-labelledby="custom-word-list-title" aria-busy={load === 'loading'}>
        <h2 id="custom-word-list-title">등록된 단어 · {words.length}개</h2>
        {load === 'loading' && <p role="status">단어 목록을 불러오고 있어요.</p>}
        {load === 'error' && <div role="alert" className="custom-word-state"><p>단어 목록을 불러오지 못했어요.</p><Button variant="secondary" onClick={reload}>다시 조회</Button></div>}
        {load === 'ready' && words.length === 0 && <p>아직 등록한 공통 단어가 없어요. 기본 개인정보 탐지는 계속 적용돼요.</p>}
        {load === 'ready' && words.length > 0 && <ul className="custom-word-list">
          {words.map((item) => <li key={item.id}>
            <div className="custom-word-row">
              <strong>{item.word}</strong>
              <span className="custom-word-tag">기업 공통 · 강제 적용</span>
              {confirmId !== item.id && <Button variant="secondary" onClick={() => { setConfirmId(item.id); setDeleteError('') }}>삭제</Button>}
            </div>
            {confirmId === item.id && <div className="custom-word-confirm" role="group" aria-label={`${item.word} 삭제 확인`}>
              <p>기업 공통 목록에서 삭제돼요. 직원 화면의 다음 마스킹부터 적용되지 않아요.</p>
              {deleteError && <p className="custom-word-error" role="alert">{deleteError} 단어는 등록된 상태로 유지돼요.</p>}
              <div className="custom-word-actions">
                <Button onClick={() => void remove(item.id)} disabled={deleting}>{deleting ? '삭제 중…' : deleteError ? '다시 시도' : '삭제 확인'}</Button>
                <Button variant="secondary" onClick={() => setConfirmId(null)} disabled={deleting}>취소</Button>
              </div>
            </div>}
          </li>)}
        </ul>}
      </section>
    </>
  )
}
