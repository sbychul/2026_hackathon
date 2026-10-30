// @vitest-environment jsdom

import { act, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ResultPage from '../pages/ResultPage'
import PdfResultPage from '../pages/PdfResultPage'
import type PdfPreview from '../components/PdfPreview'

const fake = vi.hoisted(() => ({
  save: vi.fn(),
  extract: vi.fn(),
  preview: null as ComponentProps<typeof PdfPreview> | null,
}))

vi.mock('../api/detections', () => ({ saveDetections: fake.save }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({ GlobalWorkerOptions: {} }))
vi.mock('../lib/pdf/extract', async (importOriginal) => ({
  ...await importOriginal<typeof import('../lib/pdf/extract')>(),
  extractPdf: fake.extract,
}))
vi.mock('../components/PdfPreview', () => ({
  // 무거운 PDF 그리기만 대체하고 부모의 최신 영역과 완료 알림을 그대로 연결한다.
  default: (props: ComponentProps<typeof PdfPreview>) => {
    fake.preview = props
    return <section aria-label="가린 결과 미리보기" />
  },
}))

let container: HTMLDivElement
let root: Root

// 실제 화면을 붙여 훅과 상태 구독을 브라우저 문서 환경에서 실행한다.
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  fake.save.mockReset().mockResolvedValue({ savedRows: 1 })
  fake.extract.mockReset()
  fake.preview = null
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

// 구독과 화면을 정리해 검사 사이에 작업 상태가 남지 않게 한다.
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

// 표시된 이름으로 실제 버튼을 찾아 비활성 상태와 클릭을 검사한다.
function button(label: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find((item) => item.textContent === label)
  if (!found) throw new Error(`${label} 버튼을 찾지 못했어요.`)
  return found
}

// 현재 렌더링된 미리보기의 영역과 콜백을 가져온다.
function preview() {
  if (!fake.preview) throw new Error('미리보기가 아직 연결되지 않았어요.')
  return fake.preview
}

describe('실제 결과 화면의 완료 상태 수명', () => {
  it('기업 텍스트는 같은 입력 재렌더링에 완료를 유지하고 새 입력은 새 작업으로 저장한다', async () => {
    const onRestart = vi.fn()
    const text = '전화 010-0000-0001'
    await act(async () => root.render(<ResultPage mode="company" text={text} onRestart={onRestart} />))
    expect(button('가린 결과 복사').disabled).toBe(true)

    await act(async () => button('마스킹 완료').click())
    expect(fake.save).toHaveBeenCalledExactlyOnceWith({ inputType: 'text', counts: { phone: 1 } })
    expect(button('마스킹 완료됨').disabled).toBe(true)
    expect(button('가린 결과 복사').disabled).toBe(false)

    await act(async () => root.render(<ResultPage mode="company" text={text} onRestart={() => onRestart()} />))
    await act(async () => button('마스킹 완료됨').click())
    expect(button('마스킹 완료됨').disabled).toBe(true)
    expect(button('가린 결과 복사').disabled).toBe(false)
    expect(fake.save).toHaveBeenCalledTimes(1)

    await act(async () => root.render(<ResultPage mode="company" text="메일 sample@example.test" onRestart={onRestart} />))
    expect(button('마스킹 완료').disabled).toBe(false)
    expect(button('가린 결과 복사').disabled).toBe(true)
    expect(fake.save).toHaveBeenCalledTimes(1)
    await act(async () => button('마스킹 완료').click())
    expect(fake.save).toHaveBeenNthCalledWith(2, { inputType: 'text', counts: { email: 1 } })
    expect(button('마스킹 완료됨').disabled).toBe(true)
    expect(button('가린 결과 복사').disabled).toBe(false)
  })

  it('직접 영역을 바꾸면 이전 PDF 미리보기로 완료할 수 없고 최신 미리보기 준비 후 한 번 저장한다', async () => {
    const text = '010-0000-0001'
    fake.extract.mockResolvedValue({
      pages: [{
        pageNumber: 1, width: 300, height: 400,
        viewportTransform: [1, 0, 0, -1, 0, 400], text, hasText: true,
        spans: [{ start: 0, end: text.length, piece: { text, x: 20, y: 350, width: 130, height: 12 } }],
      }],
      emptyPages: [], allEmpty: false,
    })
    const file = new File(['가상 PDF'], '가상.pdf', { type: 'application/pdf' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(1) })
    await act(async () => root.render(<PdfResultPage mode="company" file={file} onRestart={vi.fn()} />))
    expect(button('마스킹 완료').disabled).toBe(true)
    expect(button('가린 PDF 내려받기').disabled).toBe(true)

    const previous = preview()
    const blob = new Blob(['가린 PDF'], { type: 'application/pdf' })
    await act(async () => previous.onReady(blob, previous.regions))
    expect(button('마스킹 완료').disabled).toBe(false)

    await act(async () => button('좌표로 추가').click())
    const form = container.querySelector('form')!
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(container.textContent).toContain('직접 추가 · 1개')
    expect(preview().regions).toHaveLength(previous.regions.length + 1)
    expect(button('마스킹 완료').disabled).toBe(true)
    expect(button('가린 PDF 내려받기').disabled).toBe(true)
    await act(async () => button('마스킹 완료').click())
    expect(fake.save).not.toHaveBeenCalled()

    await act(async () => previous.onReady(blob, previous.regions))
    expect(button('마스킹 완료').disabled).toBe(true)
    expect(fake.save).not.toHaveBeenCalled()

    const current = preview()
    await act(async () => current.onReady(blob, current.regions))
    expect(button('마스킹 완료').disabled).toBe(false)
    expect(button('가린 PDF 내려받기').disabled).toBe(true)
    await act(async () => button('마스킹 완료').click())
    expect(fake.save).toHaveBeenCalledExactlyOnceWith({ inputType: 'pdf', counts: { phone: 1 } })
    expect(button('마스킹 완료됨').disabled).toBe(true)
    expect(button('가린 PDF 내려받기').disabled).toBe(false)

    await act(async () => button('이 영역 취소').click())
    expect(button('가린 PDF 내려받기').disabled).toBe(true)
    const changed = preview()
    await act(async () => changed.onReady(blob, changed.regions))
    await act(async () => button('마스킹 완료됨').click())
    expect(button('가린 PDF 내려받기').disabled).toBe(false)
    expect(fake.save).toHaveBeenCalledTimes(1)
  })
})
