import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'

// 좌표는 페이지 기본 회전을 적용한 배율 1 화면의 왼쪽 위 기준이며, 페이지 번호는 1부터 시작한다.
export interface PdfMaskRegion {
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
}

export interface PdfExportOptions {
  // 기본 배율 2는 144 해상도에 해당하며, 미리보기 확대 배율과 독립적이다.
  scale?: number
  onProgress?: (completedPages: number, totalPages: number) => void
}

// 잘못된 좌표 때문에 가림이 누락된 문서가 저장되는 것을 막는다.
function validateRegions(regions: PdfMaskRegion[], pageCount: number): void {
  for (const region of regions) {
    if (!Number.isInteger(region.pageNumber) || region.pageNumber < 1 || region.pageNumber > pageCount
      || ![region.x, region.y, region.width, region.height].every(Number.isFinite)
      || region.x < 0 || region.y < 0 || region.width <= 0 || region.height <= 0) {
      throw new Error('가릴 영역의 페이지 번호나 좌표가 올바르지 않습니다.')
    }
  }
}

// 캔버스의 가려진 픽셀을 손실 없는 이미지로 변환한다.
function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('가린 페이지를 이미지로 변환하지 못했습니다.'))
    }, 'image/png')
  })
}

// 원본을 복사하지 않고 모든 페이지를 가린 이미지로 다시 구성한 PDF를 반환한다.
export async function exportMaskedPdf(
  source: PDFDocumentProxy,
  regions: readonly PdfMaskRegion[],
  options: PdfExportOptions = {},
): Promise<Blob> {
  const scale = options.scale ?? 2
  if (!Number.isFinite(scale) || scale < 1 || scale > 4) {
    throw new Error('저장 배율은 1 이상 4 이하로 지정해 주세요.')
  }
  if (!Number.isInteger(source.numPages) || source.numPages < 1) {
    throw new Error('저장할 페이지가 없습니다.')
  }
  // 저장 중 사용자가 선택을 바꿔도 시작 시점의 선택을 유지한다.
  const masks = regions.map((region) => ({ ...region }))
  validateRegions(masks, source.numPages)
  const output = await PDFDocument.create()
  output.setTitle('개인정보를 가린 문서')
  output.setCreator('개인정보 마스킹')
  output.setProducer('개인정보 마스킹')

  for (let pageNumber = 1; pageNumber <= source.numPages; pageNumber++) {
    const page = await source.getPage(pageNumber)
    const base = page.getViewport({ scale: 1 })
    // 큰 페이지는 캔버스 한도(한 변 8192, 1,600만 픽셀) 안에 들도록 해당 페이지만 배율을 낮춘다.
    // 올림으로 늘어나는 픽셀까지 고려해 한도보다 조금 작게 잡는다.
    const pageScale = Math.min(scale, 8191 / base.width, 8191 / base.height,
      Math.sqrt(15_980_000 / (base.width * base.height)))
    const viewport = page.getViewport({ scale: pageScale })
    const width = Math.ceil(viewport.width)
    const height = Math.ceil(viewport.height)
    if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1
      || width > 8192 || height > 8192 || width * height > 16_000_000) {
      throw new Error(`${pageNumber}쪽의 크기를 읽을 수 없습니다.`)
    }
    const pageMasks = masks.filter((region) => region.pageNumber === pageNumber)
    for (const region of pageMasks) {
      if (region.x + region.width > base.width || region.y + region.height > base.height) {
        throw new Error(`${pageNumber}쪽의 가릴 영역이 페이지 범위를 벗어났습니다.`)
      }
    }

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    try {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('페이지를 그릴 수 없습니다.')
      await page.render({ canvas, canvasContext: context, viewport, background: '#ffffff' }).promise
      context.save()
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.globalAlpha = 1
      context.globalCompositeOperation = 'source-over'
      context.fillStyle = '#000000'
      for (const region of pageMasks) {
        // 소수점 반올림과 글자 가장자리 때문에 원문 픽셀이 남지 않도록 한 픽셀 여유를 둔다.
        const left = Math.max(0, Math.floor(region.x * pageScale) - 1)
        const top = Math.max(0, Math.floor(region.y * pageScale) - 1)
        const right = Math.min(width, Math.ceil((region.x + region.width) * pageScale) + 1)
        const bottom = Math.min(height, Math.ceil((region.y + region.height) * pageScale) + 1)
        context.fillRect(left, top, right - left, bottom - top)
      }
      context.restore()
      const png = await canvasToPng(canvas)
      const image = await output.embedPng(await png.arrayBuffer())
      const outputPage = output.addPage([base.width, base.height])
      outputPage.drawImage(image, { x: 0, y: 0, width: base.width, height: base.height })
    } finally {
      // 페이지마다 임시 캔버스와 렌더링 자원을 해제하고, 호출자가 소유한 원본 문서는 유지한다.
      canvas.width = 0
      canvas.height = 0
      page.cleanup()
    }
    options.onProgress?.(pageNumber, source.numPages)
  }
  const bytes = await output.save()
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
}

// 완성된 문서만 내려받고 임시 주소를 해제한다.
export async function downloadMaskedPdf(
  source: PDFDocumentProxy,
  regions: readonly PdfMaskRegion[],
  filename = '가린-문서.pdf',
  options: PdfExportOptions = {},
): Promise<void> {
  const blob = await exportMaskedPdf(source, regions, options)
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename.toLowerCase().endsWith('.pdf') ? filename : `${filename}.pdf`
  try {
    document.body.appendChild(link)
    link.click()
  } finally {
    link.remove()
    // 브라우저가 다운로드를 시작할 시간을 확보한 뒤 주소를 해제한다.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
