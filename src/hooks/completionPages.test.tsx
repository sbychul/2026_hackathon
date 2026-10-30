import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ResultPage from '../pages/ResultPage'
import PdfResultPage from '../pages/PdfResultPage'

// 정적 렌더링 중 화면을 이동하지 않는다.
const noop = () => {}

describe('마스킹 완료 화면의 초기 상태', () => {
  it('기업 텍스트는 명시적 완료 버튼과 안내를 표시하고 완료 전 복사를 막는다', () => {
    const html = renderToStaticMarkup(<ResultPage mode="company" text="010-0000-0001" onRestart={noop} />)
    expect(html).toMatch(/<button[^>]*>마스킹 완료<\/button>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>가린 결과 복사<\/button>/)
    expect(html).toContain('자동 탐지 건수를 한 번만 기록해요.')
  })

  it('개인 텍스트에는 완료 버튼이 없고 바로 복사할 수 있다', () => {
    const html = renderToStaticMarkup(<ResultPage text="010-0000-0001" onRestart={noop} />)
    expect(html).not.toContain('마스킹 완료')
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>가린 결과 복사<\/button>/)
  })

  it('PDF를 읽는 중에는 기업 완료와 내려받기 버튼 모두 비활성화한다', () => {
    const html = renderToStaticMarkup(<PdfResultPage mode="company" file={new File([], '가상.pdf')} onRestart={noop} />)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>마스킹 완료<\/button>/)
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>가린 PDF 내려받기<\/button>/)
  })
})
