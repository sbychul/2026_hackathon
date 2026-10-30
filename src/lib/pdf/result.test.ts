import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import { extractPdf } from './extract'
import { detectPdf } from './result'

describe('PDF 화면 탐지 연결', () => {
  it('여러 쪽과 회전된 쪽의 탐지 값에 올바른 쪽 번호와 가림 좌표를 연결한다', async () => {
    const source = await PDFDocument.create()
    const font = await source.embedFont(StandardFonts.Helvetica)
    const first = source.addPage([595, 842])
    first.drawText('010-1234-5678', { x: 40, y: 700, size: 14, font })
    const second = source.addPage([595, 842])
    second.setRotation(degrees(90))
    second.drawText('fake@example.com', { x: 40, y: 700, size: 14, font })
    const text = await extractPdf(await source.save())
    const matches = detectPdf(text.pages)

    expect(matches.map(({ ruleId, pageNumber, value }) => ({ ruleId, pageNumber, value }))).toEqual([
      { ruleId: 'phone', pageNumber: 1, value: '010-1234-5678' },
      { ruleId: 'email', pageNumber: 2, value: 'fake@example.com' },
    ])
    for (const match of matches) {
      const page = text.pages[match.pageNumber - 1]
      expect(match.regions.length).toBeGreaterThan(0)
      for (const region of match.regions) {
        expect(region.pageNumber).toBe(match.pageNumber)
        expect(region.x).toBeGreaterThanOrEqual(0)
        expect(region.y).toBeGreaterThanOrEqual(0)
        expect(region.width).toBeGreaterThan(0)
        expect(region.height).toBeGreaterThan(0)
        expect(region.x + region.width).toBeLessThanOrEqual(page.width)
        expect(region.y + region.height).toBeLessThanOrEqual(page.height)
      }
    }
    // 화면에서 첫 항목의 체크를 끄면 두 번째 쪽의 영역만 남는다.
    expect(matches.filter((_, i) => i !== 0).flatMap((match) => match.regions).every((region) => region.pageNumber === 2)).toBe(true)
  })

  it('아무것도 찾지 못했거나 페이지가 없으면 가림 영역을 만들지 않는다', () => {
    expect(detectPdf([])).toEqual([])
    expect(detectPdf([{
      pageNumber: 1, width: 595, height: 842, viewportTransform: [1, 0, 0, -1, 0, 842],
      text: '개인정보가 없는 일반 문장', spans: [], hasText: true,
    }])).toEqual([])
  })
})
