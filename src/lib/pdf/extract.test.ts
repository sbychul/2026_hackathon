import { describe, expect, it } from 'vitest'
import { extractPdf, findRects, joinPieces, type RawPiece } from './extract'

// 테스트 값은 전부 가짜 정보다.

// 글자 조각 하나를 만든다. 위치와 크기는 테스트에서 중요하지 않은 기본값이다.
const piece = (text: string, x: number, endsLine = false): RawPiece => ({
  text,
  x,
  y: 700,
  width: text.length * 10,
  height: 12,
  endsLine,
})

// 영문 글자가 들어 있는 간단한 PDF 파일을 직접 만든다. 내용이 빈 문자열이면 텍스트 없는 페이지가 된다.
function makePdf(pageContents: string[]): Uint8Array {
  const objs: string[] = []
  const kids = pageContents.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageContents.length} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pageContents.forEach((content, i) => {
    const pageId = 4 + i * 2
    objs[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`
    objs[pageId + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  })

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objs.length; id++) {
    offsets[id] = pdf.length
    pdf += `${id} 0 obj\n${objs[id]}\nendobj\n`
  }
  const xrefStart = pdf.length
  pdf += `xref\n0 ${objs.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objs.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`
  return new TextEncoder().encode(pdf)
}

// 정해진 위치에 글자를 쓰는 PDF 명령 한 줄을 만든다.
const writeAt = (x: number, y: number, text: string) =>
  `BT /F1 12 Tf 1 0 0 1 ${x} ${y} Tm (${text}) Tj ET`

describe('joinPieces', () => {
  it('조각을 이어 붙이고 조각별 위치를 기억한다', () => {
    const { text, spans } = joinPieces([piece('성명: ', 0), piece('홍길동', 60)])
    expect(text).toBe('성명: 홍길동')
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.piece.text)
    }
  })

  it('줄이 끝나는 조각 뒤에는 줄바꿈을 넣고 위치가 밀리지 않는다', () => {
    const { text, spans } = joinPieces([piece('첫줄', 0, true), piece('둘째줄', 0)])
    expect(text).toBe('첫줄\n둘째줄')
    for (const span of spans) {
      expect(text.slice(span.start, span.end)).toBe(span.piece.text)
    }
  })

  it('빈 조각은 위치 목록에 넣지 않는다', () => {
    const { text, spans } = joinPieces([piece('', 0, true), piece('가나', 0)])
    expect(text).toBe('\n가나')
    expect(spans).toHaveLength(1)
  })
})

describe('findRects', () => {
  it('조각 일부만 걸리면 글자 수 비율만큼의 영역을 구한다', () => {
    const { spans } = joinPieces([piece('0123456789', 100)]) // 너비 100, 글자당 10
    const [rect] = findRects(spans, 2, 5)
    expect(rect.x).toBeCloseTo(120)
    expect(rect.width).toBeCloseTo(30)
  })

  it('여러 조각에 걸치면 조각마다 영역을 돌려주고, 걸치지 않으면 비어 있다', () => {
    const { spans } = joinPieces([piece('가나다', 0), piece('라마바', 100)])
    expect(findRects(spans, 1, 5)).toHaveLength(2)
    expect(findRects(spans, 6, 9)).toEqual([])
  })
})

describe('extractPdf', () => {
  const pdf = makePdf([
    `${writeAt(72, 700, 'Name: Hong Gildong')}\n${writeAt(72, 650, 'Phone 010-1234-5678')}`,
    '', // 텍스트 없는 페이지
    writeAt(72, 700, 'Third page'),
  ])

  it('페이지별로 글자를 읽는다', async () => {
    const result = await extractPdf(pdf)
    expect(result.pages).toHaveLength(3)
    expect(result.pages[0].text).toContain('Hong Gildong')
    expect(result.pages[0].text).toContain('010-1234-5678')
    expect(result.pages[2].text).toContain('Third page')
  })

  it('텍스트 없는 페이지를 구분한다', async () => {
    const result = await extractPdf(pdf)
    expect(result.emptyPages).toEqual([2])
    expect(result.allEmpty).toBe(false)
    expect(result.pages[1].hasText).toBe(false)
  })

  it('모든 페이지에 텍스트가 없으면 스캔본으로 본다', async () => {
    const result = await extractPdf(makePdf(['', '']))
    expect(result.emptyPages).toEqual([1, 2])
    expect(result.allEmpty).toBe(true)
  })

  it('이어 붙인 문자열의 위치로 원래 좌표를 찾는다', async () => {
    const { pages } = await extractPdf(pdf)
    const page = pages[0]
    const start = page.text.indexOf('010-1234-5678')
    const end = start + '010-1234-5678'.length
    const rects = findRects(page.spans, start, end)
    expect(rects.length).toBeGreaterThan(0)
    // 번호 앞에 "Phone " 글자가 있으므로 영역은 줄 시작(72)보다 오른쪽에서 시작한다.
    expect(rects[0].x).toBeGreaterThan(72)
    expect(rects[0].y).toBeCloseTo(650, 0)
    // 번호가 줄 끝에서 끝나므로 영역의 오른쪽 끝이 그 글자 조각의 오른쪽 끝과 같다.
    const endSpan = page.spans.find((s) => s.start < end && end <= s.end)
    const right = Math.max(...rects.map((r) => r.x + r.width))
    expect(right).toBeCloseTo((endSpan?.piece.x ?? 0) + (endSpan?.piece.width ?? 0), 0)
  })

  it('넘겨준 원본 데이터는 그대로 남는다', async () => {
    const copy = pdf.slice()
    await extractPdf(copy)
    expect(copy.byteLength).toBe(pdf.byteLength)
  })
})
