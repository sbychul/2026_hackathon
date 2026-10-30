// 일반 빌드는 Node와 구형 브라우저에 없는 Uint8Array.toHex를 써서 실패하므로 보완 코드가 든 legacy 빌드를 쓴다.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

// 브라우저에서만 PDF를 읽는 보조 스크립트의 위치를 지정한다. (테스트 환경에서는 지정하지 않는다)
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
    import.meta.url,
  ).toString()
}

// 한 번에 처리할 수 있는 최대 쪽수
export const MAX_PAGES = 50

// 글자 밑선 아래로 내려가는 부분(g, y, 쉼표 등)을 덮기 위해 글자 높이에 더하는 비율
const DESCENT_RATIO = 0.25

// PDF가 나눠 준 글자 조각 하나. 좌표는 PDF 원본 좌표(왼쪽 아래 기준)이고 y는 글자 밑선이다.
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
  width: number // 기본 회전을 적용한 배율 1 화면 기준
  height: number
  viewportTransform: number[] // PDF 원본 좌표를 화면 좌표로 바꾸는 행렬
  text: string
  spans: PieceSpan[]
  hasText: boolean
}

export interface PdfText {
  pages: PageText[]
  emptyPages: number[] // 텍스트가 없어 글자 인식(OCR, #20)이 필요한 페이지 번호
  allEmpty: boolean // 모든 페이지에 텍스트가 없으면 스캔본으로 본다
}

// 가릴 영역. export.ts의 PdfMaskRegion과 같은 기준(기본 회전을 적용한 배율 1 화면의 왼쪽 위)이다.
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

// 문자열에 공백이 아닌 글자가 있는지 확인한다.
export const hasVisibleText = (text: string) => text.trim().length > 0

// PDF 원본 좌표의 사각형을 화면 좌표로 바꾸고 페이지 밖으로 나간 부분을 잘라낸다.
function toScreenRect(
  [a, b, c, d, e, f]: number[],
  page: { width: number; height: number },
  x0: number, y0: number, x1: number, y1: number,
): Rect {
  const xs = [a * x0 + c * y0 + e, a * x1 + c * y1 + e]
  const ys = [b * x0 + d * y0 + f, b * x1 + d * y1 + f]
  const left = Math.max(0, Math.min(...xs))
  const top = Math.max(0, Math.min(...ys))
  const right = Math.min(page.width, Math.max(...xs))
  const bottom = Math.min(page.height, Math.max(...ys))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

// 이어 붙인 문자열의 [start, end) 구간이 차지하는 화면 영역들을 구한다.
// 조각 안에서는 글자 수 비율로 나누고, 글자 폭 차이로 가장자리가 새지 않도록 양쪽에 반 글자씩 여유를 둔다.
// ponytail: 글자 수 비율 추정이라 폭 차이가 큰 글꼴은 반 글자 이상 어긋날 수 있다. 필요하면 글리프 폭으로 바꾼다.
export function findRects(
  page: Pick<PageText, 'spans' | 'viewportTransform' | 'width' | 'height'>,
  start: number,
  end: number,
): Rect[] {
  const rects: Rect[] = []
  for (const span of page.spans) {
    const from = Math.max(start, span.start)
    const to = Math.min(end, span.end)
    if (from >= to) continue
    const { x, y, width, height } = span.piece
    const charWidth = width / (span.end - span.start)
    const left = Math.max(x, x + charWidth * (from - span.start - 0.5))
    const right = Math.min(x + width, x + charWidth * (to - span.start + 0.5))
    const rect = toScreenRect(page.viewportTransform, page, left, y - height * DESCENT_RATIO, right, y + height)
    if (rect.width > 0 && rect.height > 0) rects.push(rect)
  }
  return rects
}

// pdf.js의 열기 오류를 사용자에게 보여 줄 한글 문구로 바꾼다.
function toOpenError(error: unknown): Error {
  const name = error instanceof Error ? error.name : ''
  if (name === 'PasswordException') return new Error('암호가 걸린 PDF는 열 수 없습니다. 암호를 해제한 뒤 다시 올려 주세요.')
  if (name === 'InvalidPDFException') return new Error('손상되었거나 올바르지 않은 PDF입니다.')
  return new Error('PDF를 읽지 못했습니다.', { cause: error })
}

// PDF 파일을 받아 페이지별로 글자를 이어 붙이고, 텍스트 없는 페이지를 구분해 반환한다.
export async function extractPdf(data: ArrayBuffer | Uint8Array): Promise<PdfText> {
  // 읽는 도중 원본이 비워지지 않도록 복사본을 넘긴다.
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0))
  // 글꼴 파일은 쓰지 않으므로 불러오지 않고, 일부만 읽히는 손상 파일은 조용히 넘기지 않고 실패로 본다.
  const task = pdfjs.getDocument({ data: bytes, enableXfa: false, disableFontFace: true, stopAtErrors: true })

  const pages: PageText[] = []
  try {
    const doc = await task.promise.catch((error: unknown) => {
      throw toOpenError(error)
    })
    if (doc.numPages > MAX_PAGES) {
      throw new Error(`PDF는 ${MAX_PAGES}쪽까지만 처리할 수 있습니다. (현재 ${doc.numPages}쪽)`)
    }

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      const page = await doc.getPage(pageNumber)
      try {
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
          viewportTransform: viewport.transform,
          text,
          spans,
          hasText: hasVisibleText(text),
        })
      } finally {
        page.cleanup() // 페이지마다 쓰던 메모리를 바로 정리한다.
      }
    }
  } finally {
    await task.destroy() // 성공하든 실패하든 PDF가 쓰던 메모리와 보조 스크립트를 정리한다.
  }

  const emptyPages = pages.filter((p) => !p.hasText).map((p) => p.pageNumber)
  return { pages, emptyPages, allEmpty: pages.length > 0 && emptyPages.length === pages.length }
}
