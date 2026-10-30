import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from 'pdfjs-dist'
import worker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { detect } from '../../src/masking/detect'
import { downloadMaskedPdf, exportMaskedPdf, type PdfMaskRegion } from '../../src/lib/pdf/export'

GlobalWorkerOptions.workerSrc = worker
const rows = ['900101-1234567', '010-1234-5678', 'test@example.com', '4111-1111-1111-1111']
let source: PDFDocumentProxy | undefined
let masks: PdfMaskRegion[] = []
const status = document.querySelector<HTMLPreElement>('#status')!

// 가짜 정보가 있는 문서와 회전된 문서를 한 파일로 만든다.
async function createSample(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  pdf.setTitle('원본 검증용 제목')
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const page = pdf.addPage([400, 500])
  page.drawText('SAMPLE - PUBLIC HEADING', { x: 30, y: 450, size: 18, font })
  rows.forEach((text, index) => page.drawText(text, { x: 40, y: 390 - index * 55, size: 16, font }))
  page.drawText('Keep this public line.', { x: 30, y: 80, size: 16, font })
  const rotated = pdf.addPage([300, 400])
  rotated.setRotation(degrees(90))
  rotated.drawText(rows[1], { x: 40, y: 250, size: 16, font })
  return pdf.save()
}

// 샘플 문서를 브라우저 다운로드로 전달한다.
document.querySelector('#sample')!.addEventListener('click', async () => {
  const bytes = await createSample()
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href = url; link.download = '가짜정보-검증샘플.pdf'; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
})

// 실제 페이지를 그려 원본과 저장 결과를 눈으로 비교하도록 보여준다.
async function showPages(pdf: PDFDocumentProxy, target: string): Promise<HTMLCanvasElement[]> {
  const container = document.querySelector(target)!
  container.replaceChildren()
  const canvases: HTMLCanvasElement[] = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number)
    const viewport = page.getViewport({ scale: 1 })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
    await page.render({ canvas, viewport }).promise
    container.append(canvas); canvases.push(canvas)
  }
  return canvases
}

// 업로드한 샘플의 실제 텍스트를 기존 탐지 함수로 검사하고 샘플 좌표에 연결한다.
document.querySelector('#source')!.addEventListener('change', async (event) => {
  try {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    if (source) await source.loadingTask.destroy()
    source = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
    if (source.numPages !== 2) throw new Error('제공된 두 쪽짜리 샘플 문서를 선택해 주세요.')
    masks = []
    const found: string[] = []
    for (let number = 1; number <= source.numPages; number++) {
      const page = await source.getPage(number)
      const content = await page.getTextContent()
      const text = content.items.filter((item) => 'str' in item).map((item) => item.str).join(' ')
      const matches = detect(text)
      found.push(...matches.map((match) => match.ruleId))
      if (number === 1) {
        if (!rows.every((value) => text.includes(value)) || matches.length !== 4) throw new Error('샘플 내용이 일치하지 않습니다.')
        rows.forEach((_, index) => masks.push({ pageNumber: 1, x: 38, y: 94 + index * 55, width: 260, height: 24 }))
      } else {
        if (matches.length !== 1) throw new Error('회전 페이지의 탐지 결과가 일치하지 않습니다.')
        masks.push({ pageNumber: 2, x: 246, y: 38, width: 24, height: 200 })
      }
    }
    await showPages(source, '#original')
    status.textContent = `기존 탐지 함수: ${found.length}건 탐지 (${found.join(', ')})\n원본 2쪽 읽기 완료. 다운로드를 누르세요.`
    document.querySelector<HTMLButtonElement>('#download')!.disabled = false
    document.querySelector<HTMLButtonElement>('#invalid')!.disabled = false
  } catch (error) { status.textContent = String(error); document.querySelector<HTMLButtonElement>('#download')!.disabled = true }
})

// 제품의 실제 다운로드 함수를 호출해 파일을 저장한다.
document.querySelector('#download')!.addEventListener('click', async () => {
  try {
    if (!source) return
    await downloadMaskedPdf(source, masks, '가림-검증결과', { onProgress: (done, total) => { status.textContent = `${done}/${total}쪽 저장 중` } })
    status.textContent = '다운로드 요청 완료: 가림-검증결과.pdf\n실제로 내려받은 파일을 결과 입력에서 다시 열어 주세요.'
  } catch (error) { status.textContent = String(error) }
})

// 잘못된 좌표가 조용히 무시되지 않고 저장을 차단하는지 검사한다.
document.querySelector('#invalid')!.addEventListener('click', async () => {
  if (!source) return
  try { await exportMaskedPdf(source, [{ pageNumber: 1, x: 9999, y: 0, width: 20, height: 20 }]); status.textContent = '실패: 잘못된 좌표가 허용되었습니다.' }
  catch (error) { status.textContent = `잘못된 좌표 차단 확인: ${String(error)}` }
})

// 실제 다운로드 파일을 다시 파싱해 텍스트 제거와 검은 픽셀, 문서 구조를 검사한다.
document.querySelector('#output')!.addEventListener('change', async (event) => {
  let pdf: PDFDocumentProxy | undefined
  try {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    const bytes = await file.arrayBuffer()
    const structure = await PDFDocument.load(bytes.slice(0))
    pdf = await getDocument({ data: new Uint8Array(bytes) }).promise
    if (pdf.numPages !== 2) throw new Error('결과 페이지 수가 다릅니다.')
    const counts: number[] = []
    for (let number = 1; number <= pdf.numPages; number++) counts.push((await (await pdf.getPage(number)).getTextContent()).items.length)
    const canvases = await showPages(pdf, '#result')
    const black = masks.length === 5 && masks.every((mask) => {
      const pixels = canvases[mask.pageNumber - 1].getContext('2d')!.getImageData(mask.x + 2, mask.y + 2, mask.width - 4, mask.height - 4).data
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] !== 0 || pixels[i + 1] !== 0 || pixels[i + 2] !== 0 || pixels[i + 3] !== 255) return false
      return true
    })
    const sizes = structure.getPages().map((page) => page.getSize())
    const sizeOk = sizes[0].width === 400 && sizes[0].height === 500 && sizes[1].width === 400 && sizes[1].height === 300
    const metadataOk = structure.getTitle() !== '원본 검증용 제목'
    const passed = counts.every((count) => count === 0) && black && sizeOk && metadataOk
    status.textContent = JSON.stringify({ 통과: passed, 실제파일명: file.name, 텍스트조각수: counts, 모든가림영역검정: black, 회전과크기유지: sizeOk, 원본제목제거: metadataOk, 페이지수: pdf.numPages }, null, 2)
    if (!passed) throw new Error(`검증 실패\n${status.textContent}`)
  } catch (error) { status.textContent = String(error) }
  finally { if (pdf) await pdf.loadingTask.destroy() }
})
