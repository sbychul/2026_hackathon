import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { PDFDict, PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import PdfResultPage from '../../src/pages/PdfResultPage'
import '../../src/index.css'
import '../../src/App.css'

// 가짜 자동 탐지 글자와 직접 가릴 색상 영역이 있는 두 쪽 문서를 만든다.
async function sample(): Promise<File> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const first = doc.addPage([400, 500])
  first.drawText('010-1234-5678', { x: 40, y: 400, size: 18, font })
  first.drawText('PRIVATE SIGNATURE', { x: 80, y: 265, size: 12, font })
  first.drawRectangle({ x: 80, y: 250, width: 100, height: 50, color: (await import('pdf-lib')).rgb(0.8, 0.2, 0.2) })
  first.drawText('PUBLIC HEADING', { x: 40, y: 450, size: 18, font })
  const second = doc.addPage([300, 400])
  second.setRotation(degrees(90))
  second.drawText('PUBLIC SECOND PAGE', { x: 30, y: 350, size: 14, font })
  second.drawRectangle({ x: 60, y: 100, width: 60, height: 50, color: (await import('pdf-lib')).rgb(0.2, 0.2, 0.8) })
  return new File([new Uint8Array(await doc.save())], '직접가리기-가짜샘플.pdf', { type: 'application/pdf' })
}

interface CheckedRegion { pageNumber: number; x: number; y: number; width: number; height: number }

// 내려받기를 누른 순간 화면에 표시된 직접 영역을 검사 기준으로 기억한다.
function readSelectedRegions(): CheckedRegion[] {
  return [...document.querySelectorAll('.pdf-manual-item')].map((item) => {
    const pageNumber = Number(item.querySelector('h3')!.textContent!.match(/· (\d+)쪽/)![1])
    const [x, y, width, height] = [...item.querySelector('p')!.textContent!.matchAll(/\d+/g)].map((match) => Number(match[0]))
    return { pageNumber, x, y, width, height }
  })
}

// 실제 다운로드 파일을 다시 열어 검은 픽셀과 텍스트 및 원본 구조의 제거를 검사한다.
async function inspect(event: ChangeEvent<HTMLInputElement>, report: (message: string) => void, expected: CheckedRegion[]) {
  const file = event.target.files?.[0]
  if (!file) return
  event.target.value = ''
  if (!expected.length) {
    report('검사 대기: 직접 영역을 하나 이상 추가한 뒤 내려받고, 방금 받은 파일을 선택해 주세요. 자동 탐지만 적용한 파일은 직접 가리기 검증 대상이 아니에요.')
    return
  }
  report('실제 내려받은 파일의 가림 픽셀과 문서 구조를 검사하고 있어요…')
  document.querySelector('#downloaded-pages')!.replaceChildren()
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const doc = await task.promise
    const structure = await PDFDocument.load(await file.arrayBuffer())
    if (doc.numPages !== 2) throw new Error('결과가 두 쪽이 아니에요.')
    for (let n = 1; n <= 2; n++) {
      const page = await doc.getPage(n)
      if ((await page.getTextContent()).items.length) throw new Error(`${n}쪽에 원문 글자가 남았어요.`)
      const viewport = page.getViewport({ scale: 1 })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      // 목록에 표시된 좌표의 반올림 오차를 피하면서 실제 선택 영역 내부의 픽셀을 검사한다.
      for (const mask of expected.filter((region) => region.pageNumber === n)) {
        const x = Math.min(canvas.width - 1, Math.max(0, Math.ceil(mask.x + Math.min(1, mask.width / 2))))
        const y = Math.min(canvas.height - 1, Math.max(0, Math.ceil(mask.y + Math.min(1, mask.height / 2))))
        const width = Math.max(1, Math.min(canvas.width - x, Math.floor(mask.width - 2)))
        const height = Math.max(1, Math.min(canvas.height - y, Math.floor(mask.height - 2)))
        const pixels = canvas.getContext('2d')!.getImageData(x, y, width, height).data
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] || pixels[i + 1] || pixels[i + 2] || pixels[i + 3] !== 255) throw new Error(`${n}쪽 직접 영역에 가려지지 않은 픽셀이 있어요. 마지막으로 내려받은 파일인지 확인해 주세요.`)
        }
      }
      const resources = structure.getPages()[n - 1].node.Resources()!
      const fonts = resources.lookupMaybe(PDFName.of('Font'), PDFDict)
      if (fonts && fonts.keys().length > 0) throw new Error('실제 글꼴 자원이 남았어요.')
      if ((await page.getAnnotations()).length) throw new Error('주석이 남았어요.')
      document.querySelector('#downloaded-pages')!.append(canvas)
    }
    if (structure.catalog.has(PDFName.of('AcroForm')) || structure.catalog.has(PDFName.of('Names'))) throw new Error('원본 양식이나 첨부 구조가 남았어요.')
    report(`통과: 실제 다운로드 파일 2쪽 · 직접 영역 ${expected.length}개 검은 픽셀 · 텍스트 0개 · 글꼴/주석/양식/첨부 없음`)
  } catch (error) { report(`실패: ${String(error)}`) }
  finally { await task.destroy() }
}

// 같은 제품 화면을 개인과 기업 모드로 열고 다운로드 파일 재검사를 제공한다.
export default function Verification() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'personal' | 'company'>('personal')
  const [status, setStatus] = useState('다운로드 파일을 선택하면 실제 결과를 검사해요.')
  const expected = useRef<CheckedRegion[]>([])
  useEffect(() => {
    void sample().then(setFile)
    // 제품 화면의 실제 내려받기 클릭을 관찰하며 가림 상태는 변경하지 않는다.
    const remember = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('button')?.textContent === '가린 PDF 내려받기') {
        expected.current = readSelectedRegions()
      }
    }
    document.addEventListener('click', remember, true)
    return () => document.removeEventListener('click', remember, true)
  }, [])
  return <><aside style={{ padding: 16 }}>
    <button onClick={() => setMode(mode === 'personal' ? 'company' : 'personal')}>현재 {mode === 'personal' ? '개인' : '기업'} 모드 · 전환</button>
    <p>예시 좌표: 1쪽 왼쪽 80, 위쪽 200, 너비 100, 높이 50 / 2쪽 왼쪽 100, 위쪽 60, 너비 50, 높이 60</p>
    <p>① 아래에서 드래그나 좌표 입력으로 직접 영역 추가 → ② 가린 PDF 내려받기 → ③ 방금 받은 파일 검사. 예시 좌표 외에 직접 지정한 영역도 검사해요.</p>
    <label>실제 내려받은 파일 검사 <input type="file" accept="application/pdf" onChange={(event) => void inspect(event, setStatus, expected.current)} /></label>
    <p role="status">{status}</p><div id="downloaded-pages" />
  </aside>{file && <PdfResultPage file={file} mode={mode} onRestart={() => { expected.current = []; void sample().then(setFile) }} />}</>
}


