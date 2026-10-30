import type { OcrProgress } from '../types'

const panel = document.querySelector<HTMLElement>('#model-download')!
const heading = document.querySelector<HTMLElement>('#model-state')!
const list = document.querySelector<HTMLElement>('#model-files')!

// 새 문서를 선택하면 앞선 문서의 모델 상태를 지운다.
export function resetModelProgress(): void {
  panel.hidden = true
  heading.textContent = ''
  list.replaceChildren()
}

// 모델 파일에서 실제 읽은 바이트를 파일별 진행 막대와 용량으로 표시한다.
export function showModelProgress(progress: OcrProgress): void {
  if (!progress.downloads) return
  panel.hidden = false
  const complete = progress.completed === progress.total
  heading.textContent = progress.modelsReady ? '모델 준비 완료 · 내 기기에서 처리합니다'
    : complete ? '모델 파일 받기 완료 · 실행기 준비 중' : '모델을 내 기기로 내려받는 중'
  list.replaceChildren(...progress.downloads.map(item=>{
    const row = document.createElement('div')
    const text = document.createElement('p')
    const percent = Math.floor(item.loaded/item.total*100)
    text.textContent = `${item.label} · ${(item.loaded/1_000_000).toFixed(2)} / ${(item.total/1_000_000).toFixed(2)}메가바이트 · ${percent}%`
    const bar = document.createElement('progress')
    bar.max = item.total; bar.value = item.loaded
    bar.setAttribute('aria-label',item.label)
    row.append(text,bar)
    return row
  }))
}

// 취소나 실패를 완료된 다운로드처럼 남기지 않는다.
export function stopModelProgress(cancelled: boolean): void {
  if (!panel.hidden) heading.textContent = cancelled ? '작업이 취소되었습니다' : '작업을 완료하지 못했습니다'
}
