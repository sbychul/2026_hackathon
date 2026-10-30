import { describe, expect, it } from 'vitest'
import { MAX_PAGES, extractPdf, findRects, hasVisibleText, joinPieces, type RawPiece } from './extract'

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

// 회전 없는 A4(595x842) 페이지의 PDF 원본 좌표를 화면 좌표로 바꾸는 행렬
const A4 = { width: 595, height: 842, viewportTransform: [1, 0, 0, -1, 0, 842] }

// 영문 글자가 들어 있는 간단한 PDF 파일을 직접 만든다. 내용이 빈 문자열이면 텍스트 없는 페이지가 된다.
function makePdf(pageContents: string[], rotate = 0): Uint8Array {
  const objs: string[] = []
  const kids = pageContents.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pageContents.length} >>`
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  pageContents.forEach((content, i) => {
    const pageId = 4 + i * 2
    objs[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Rotate ${rotate} /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`
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

describe('hasVisibleText', () => {
  it('공백과 줄바꿈만 있으면 글자가 없다고 본다', () => {
    expect(hasVisibleText('  \n')).toBe(false)
    expect(hasVisibleText('a')).toBe(true)
  })
})

describe('findRects', () => {
  it('조각 일부만 걸리면 글자 수 비율에 양쪽 반 글자 여유를 더한 영역을 구한다', () => {
    const { spans } = joinPieces([piece('0123456789', 100)]) // 너비 100, 글자당 10
    const [rect] = findRects({ ...A4, spans }, 2, 5)
    expect(rect.x).toBeCloseTo(115)
    expect(rect.width).toBeCloseTo(40)
  })

  it('왼쪽 위 기준 화면 좌표로 바꾸고 글자 밑선 아래까지 덮는다', () => {
    const { spans } = joinPieces([piece('가나', 0)]) // 밑선 y=700, 높이 12
    const [rect] = findRects({ ...A4, spans }, 0, 2)
    expect(rect.y).toBeCloseTo(842 - 712) // 글자 윗부분
    expect(rect.y + rect.height).toBeCloseTo(842 - 697) // 밑선 아래 3(높이의 25%)
  })

  it('여유를 더해도 조각 밖이나 페이지 밖으로 나가지 않는다', () => {
    const { spans } = joinPieces([piece('0123456789', 0)])
    const [rect] = findRects({ ...A4, width: 50, spans }, 0, 10)
    expect(rect.x).toBe(0)
    expect(rect.x + rect.width).toBe(50)
  })

  it('여러 조각에 걸치면 조각마다 영역을 돌려주고, 걸치지 않으면 비어 있다', () => {
    const { spans } = joinPieces([piece('가나다', 0), piece('라마바', 100)])
    const page = { ...A4, spans }
    expect(findRects(page, 1, 5)).toHaveLength(2)
    expect(findRects(page, 6, 9)).toEqual([])
    expect(findRects(page, 3, 3)).toEqual([])
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

  it('이어 붙인 문자열의 위치로 화면 좌표(왼쪽 위 기준)의 영역을 찾는다', async () => {
    const { pages } = await extractPdf(pdf)
    const page = pages[0]
    const start = page.text.indexOf('010-1234-5678')
    const end = start + '010-1234-5678'.length
    const rects = findRects(page, start, end)
    expect(rects.length).toBeGreaterThan(0)
    // 번호 앞에 "Phone " 글자가 있으므로 영역은 줄 시작(72)보다 오른쪽에서 시작한다.
    expect(rects[0].x).toBeGreaterThan(72)
    // 밑선 y=650인 12pt 글자는 화면에서 위쪽 842-662=180부터 아래쪽 842-647=195까지다.
    expect(rects[0].y).toBeCloseTo(180, 0)
    expect(rects[0].y + rects[0].height).toBeCloseTo(195, 0)
  })

  it('회전한 페이지도 회전을 적용한 화면 안의 좌표를 돌려준다', async () => {
    const { pages } = await extractPdf(makePdf([writeAt(72, 700, 'Phone 010-1234-5678')], 90))
    const page = pages[0]
    expect([page.width, page.height]).toEqual([842, 595])
    const start = page.text.indexOf('010')
    const [rect] = findRects(page, start, start + 13)
    // 90도 회전하면 원본의 밑선 y=700이 화면의 가로 위치 700 근처가 된다.
    expect(rect.x).toBeGreaterThan(690)
    expect(rect.x + rect.width).toBeLessThanOrEqual(page.width)
    expect(rect.y + rect.height).toBeLessThanOrEqual(page.height)
  })

  it('넘겨준 원본 데이터는 그대로 남는다', async () => {
    const copy = pdf.slice()
    await extractPdf(copy)
    expect(copy.byteLength).toBe(pdf.byteLength)
    const buffer = pdf.slice().buffer
    await extractPdf(buffer)
    expect(buffer.byteLength).toBe(pdf.byteLength)
  })

  it('손상된 PDF는 한글 오류 문구로 알린다', async () => {
    await expect(extractPdf(new TextEncoder().encode('이건 PDF가 아니다'))).rejects.toThrow('올바르지 않은 PDF')
  })

  it(`${MAX_PAGES}쪽을 넘으면 처리하지 않는다`, async () => {
    const pages = Array.from({ length: MAX_PAGES + 1 }, () => '')
    await expect(extractPdf(makePdf(pages))).rejects.toThrow(`${MAX_PAGES}쪽까지만`)
  })
})
