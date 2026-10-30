import { getMaskingMode } from './maskingPolicy'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MainPage from '../../pages/MainPage'
import ResultPage from '../../pages/ResultPage'
import PdfResultPage from '../../pages/PdfResultPage'

// 정적 화면 검사에서는 화면 전환을 실행하지 않는다.
const noop = () => {}
const text = '전화 010-0000-0001, 메일 demo@example.org'

describe('기업 화면의 조작과 안내', () => {
  it.each(['employee', 'admin'] as const)('%s의 텍스트 화면에는 해제 조작 없이 고정 안내와 가린 결과가 있다', (role) => {
    const html = renderToStaticMarkup(<ResultPage text={text} mode={getMaskingMode(role)} onRestart={noop} />)
    expect(html).not.toContain('type="checkbox"')
    expect(html).not.toContain('role="checkbox"')
    expect(html).toContain('2건을 모두 가렸어요')
    expect(html).toContain('모두 고정')
    expect(html).toContain('내용은 저장되지 않고 건수만 기록돼요.')
    expect(html).toContain('*************')
    expect(html).toContain('****************')
  })

  it('역할을 지정하지 않은 기존 개인 화면의 선택 기능을 유지한다', () => {
    const html = renderToStaticMarkup(<ResultPage text={text} onRestart={noop} />)
    expect(html).toContain('type="checkbox"')
    expect(html).toContain('이메일 모두 선택')
    expect(html).not.toContain('기업 개인정보 처리 안내')
  })

  it.each(['employee', 'admin'] as const)('%s의 입력 화면과 PDF 읽기 중에도 기업 안내를 표시한다', (role) => {
    const input = renderToStaticMarkup(<MainPage mode={getMaskingMode(role)} onFind={noop} onFindPdf={noop} />)
    const pdf = renderToStaticMarkup(<PdfResultPage mode={getMaskingMode(role)} file={new File([], '가상.pdf', { type: 'application/pdf' })} onRestart={noop} />)
    expect(input).toContain('기업 개인정보 처리 안내')
    expect(input).toContain('공유 전에 개인정보를 가려요')
    expect(pdf).toContain('기업 개인정보 처리 안내')
    expect(pdf).toContain('PDF를 읽고 있어요')
    expect(pdf).not.toContain('type="checkbox"')
  })
})
