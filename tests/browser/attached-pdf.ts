import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { detect } from '../../src/masking/detect'
import { downloadMaskedPdf, type PdfMaskRegion } from '../../src/lib/pdf/export'

GlobalWorkerOptions.workerSrc = worker
let source: PDFDocumentProxy | undefined
let regions: PdfMaskRegion[] = []
let originalSizes: { width: number; height: number }[] = []
const status = document.querySelector<HTMLPreElement>('#status')!

// 로컬 서버에서 테스트 파일을 읽어 문서로 연다.
async function openLocal(path: string): Promise<PDFDocumentProxy> {
  const response = await fetch(path, { cache: 'no-store' })
  if (!response.ok) throw new Error('검사할 파일을 로컬 서버에서 찾지 못했습니다.')
  return getDocument({ data: new Uint8Array(await response.arrayBuffer()) }).promise
}

// 실제 PDF 페이지를 그려 문서의 시각적 상태를 확인한다.
async function preview(pdf: PDFDocumentProxy, selector: string): Promise<HTMLCanvasElement[]> {
  const target = document.querySelector(selector)!
  target.replaceChildren()
  const canvases: HTMLCanvasElement[] = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const viewport = page.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    target.append(canvas); canvases.push(canvas)
  }
  return canvases
}

// 이 문서의 가로 글자 조각을 보수적인 가림 사각형으로 연결한다.
document.querySelector('#load')!.addEventListener('click', async () => {
  try {
    document.querySelector<HTMLButtonElement>('#save')!.disabled = true
    if (source) await source.loadingTask.destroy()
    source = await openLocal('/node_modules/.tmp/attached-source.pdf')
    regions = []; originalSizes = []
    let total = 0
    const reports: string[] = []
    for (let number = 1; number <= source.numPages; number++) {
      const page = await source.getPage(number)
      const viewport = page.getViewport({ scale: 1 })
      originalSizes.push({ width: viewport.width, height: viewport.height })
      const content = await page.getTextContent()
      const items = content.items.filter((item): item is TextItem => 'str' in item)
      let text = ''
      const spans = items.map((item) => {
        const start = text.length
        text += item.str
        const end = text.length
        text += item.hasEOL ? '\n' : ' '
        return { item, start, end }
      })
      const matches = detect(text)
      total += matches.length
      reports.push(`${number}쪽: ${matches.length}건 (${matches.map((match) => match.ruleId).join(', ')})\n${text}`)
      for (const { item, start, end } of spans) {
        if (!matches.some((match) => match.start < end && match.end > start)) continue
        if (Math.abs(item.transform[1]) > 0.01 || Math.abs(item.transform[2]) > 0.01) throw new Error('검증 도구는 기울어진 글자의 좌표를 지원하지 않습니다.')
        const [x, y] = item.transform.slice(4)
        const height = Math.max(item.height, Math.abs(item.transform[3]))
        const [a, b, c, d, e, f] = viewport.transform
        const low = y - height * 0.3, high = y + height
        const box = [a * x + c * low + e, b * x + d * low + f,
          a * (x + item.width) + c * high + e, b * (x + item.width) + d * high + f]
        const left = Math.max(0, Math.min(box[0], box[2]) - 1)
        const top = Math.max(0, Math.min(box[1], box[3]) - 1)
        const right = Math.min(viewport.width, Math.max(box[0], box[2]) + 1)
        const bottom = Math.min(viewport.height, Math.max(box[1], box[3]) + 1)
        regions.push({ pageNumber: number, x: left, y: top, width: right - left, height: bottom - top })
      }
    }
    await preview(source, '#before')
    document.querySelector('#text')!.textContent = reports.join('\n\n')
    status.textContent = `첨부 등록서 읽기 성공: ${source.numPages}쪽, 탐지 ${total}건, 가릴 글자 조각 ${regions.length}개\n이제 실제 다운로드를 누르세요.`
    document.querySelector<HTMLButtonElement>('#save')!.disabled = regions.length === 0
  } catch (error) { status.textContent = String(error) }
})

// 제품의 다운로드 함수를 그대로 호출해 실제 파일을 저장한다.
document.querySelector('#save')!.addEventListener('click', async () => {
  try {
    if (!source) return
    await downloadMaskedPdf(source, regions, '04_거래처_담당자_등록서_가림검증.pdf')
    status.textContent = '다운로드 요청 완료: 04_거래처_담당자_등록서_가림검증.pdf'
  } catch (error) { status.textContent = String(error) }
})

// 다운로드 폴더에서 가져온 실제 결과 파일을 다시 읽고 픽셀과 텍스트를 검사한다.
document.querySelector('#verify')!.addEventListener('click', async () => {
  let result: PDFDocumentProxy | undefined
  try {
    if (!source) throw new Error('먼저 원본을 열어 주세요.')
    result = await openLocal('/node_modules/.tmp/attached-downloaded.pdf')
    const canvases = await preview(result, '#after')
    let textCount = 0
    let annotations = 0
    let sizesMatch = result.numPages === source.numPages
    for (let number = 1; number <= result.numPages; number++) {
      const page = await result.getPage(number)
      textCount += (await page.getTextContent()).items.length
      annotations += (await page.getAnnotations()).length
      const viewport = page.getViewport({ scale: 1 })
      const expected = originalSizes[number - 1]
      sizesMatch &&= !!expected && Math.abs(viewport.width - expected.width) < 0.01 && Math.abs(viewport.height - expected.height) < 0.01
    }
    const black = regions.length > 0 && regions.every((region) => {
      const canvas = canvases[region.pageNumber - 1]
      if (!canvas) return false
      const left = Math.ceil(region.x + 2), top = Math.ceil(region.y + 2)
      const pixels = canvas.getContext('2d')!.getImageData(left, top, Math.max(1, Math.floor(region.width - 4)), Math.max(1, Math.floor(region.height - 4))).data
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3] !== 255) return false
      return true
    })
    status.textContent = JSON.stringify({ 통과: textCount === 0 && annotations === 0 && sizesMatch && black, 결과페이지수: result.numPages, 남은텍스트조각: textCount, 남은주석: annotations, 페이지크기일치: sizesMatch, 모든가림영역검정: black }, null, 2)
  } catch (error) { status.textContent = String(error) }
  finally { if (result) await result.loadingTask.destroy() }
})
