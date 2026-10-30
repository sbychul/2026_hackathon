import * as pdfjs from 'pdfjs-dist'

// 브라우저에서만 PDF를 읽는 보조 스크립트의 위치를 지정한다. (테스트 환경에서는 지정하지 않는다)
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}

// 텍스트가 없는 PDF(스캔본)일 때 화면에 보여줄 안내 문구
export const SCAN_NOTICE = '스캔본(이미지) PDF는 지원하지 않습니다. 텍스트가 들어 있는 PDF를 올려 주세요.'

// PDF가 나눠 준 글자 조각 하나. 좌표는 페이지 왼쪽 아래가 기준이다.
export interface TextPiece {
  text: string
  x: number
  y: number
  width: number
  height: number
}

// 글자 조각이 이어 붙인 문자열의 어느 구간(end는 포함하지 않음)에 해당하는지 기억한다.
export interface PieceSpan {
  start: number
  end: number
  piece: TextPiece
}

// 한 페이지에서 읽은 결과. 실제 값은 이 객체 안에만 있고 밖으로 저장하지 않는다.
export interface PageText {
  pageNumber: number // 1부터 시작
  width: number
  height: number
  text: string
  spans: PieceSpan[]
  hasText: boolean
}

export interface PdfText {
  pages: PageText[]
  emptyPages: number[] // 텍스트가 없는 페이지 번호
  allEmpty: boolean // 모든 페이지에 텍스트가 없으면 스캔본으로 본다
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

// 줄이 끝나는지 여부를 함께 가진 글자 조각
export type RawPiece = TextPiece & { endsLine: boolean }

// 글자 조각들을 이어 붙여 한 문자열로 만들고, 조각별 위치를 함께 반환한다.
export function joinPieces(pieces: RawPiece[]): { text: string; spans: PieceSpan[] } {
  let text = ''
  const spans: PieceSpan[] = []
  for (const { endsLine, ...piece } of pieces) {
    const start = text.length
    text += piece.text
    if (piece.text.length > 0) spans.push({ start, end: text.length, piece })
    if (endsLine) text += '\n'
  }
  return { text, spans }
}

// 이어 붙인 문자열의 [start, end) 구간이 차지하는 영역들을 구한다. 조각 안에서는 글자 수 비율로 나눈다.
export function findRects(spans: PieceSpan[], start: number, end: number): Rect[] {
  const rects: Rect[] = []
  for (const span of spans) {
    const from = Math.max(start, span.start)
    const to = Math.min(end, span.end)
    if (from >= to) continue
    const length = span.end - span.start
    const { x, y, width, height } = span.piece
    rects.push({
      x: x + (width * (from - span.start)) / length,
      y,
      width: (width * (to - from)) / length,
      height,
    })
  }
  return rects
}

// PDF 파일을 받아 페이지별로 글자를 이어 붙이고, 텍스트 없는 페이지를 구분해 반환한다.
export async function extractPdf(data: ArrayBuffer | Uint8Array): Promise<PdfText> {
  // 읽는 도중 원본이 비워지지 않도록 복사본을 넘긴다.
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0))
  const task = pdfjs.getDocument({ data: bytes })
  const doc = await task.promise

  const pages: PageText[] = []
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()

      const pieces: RawPiece[] = []
      for (const item of content.items) {
        if (!('str' in item)) continue // 글자가 아닌 표시 정보는 건너뛴다.
        const [, , , d, x, y] = item.transform
        pieces.push({
          text: item.str,
          x,
          y,
          width: item.width,
          height: item.height || Math.abs(d),
          endsLine: item.hasEOL,
        })
      }

      const { text, spans } = joinPieces(pieces)
      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        text,
        spans,
        hasText: text.trim().length > 0,
      })
    }
  } finally {
    await task.destroy() // 다 읽은 뒤 PDF가 쓰던 메모리를 정리한다.
  }

  const emptyPages = pages.filter((p) => !p.hasText).map((p) => p.pageNumber)
  return { pages, emptyPages, allEmpty: emptyPages.length === pages.length }
}
