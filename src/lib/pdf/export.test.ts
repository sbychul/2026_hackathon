import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { downloadMaskedPdf, exportMaskedPdf, type PdfMaskRegion } from './export'

const region: PdfMaskRegion = { pageNumber: 1, x: 10.25, y: 20.25, width: 40, height: 12 }

// 실제 PDF 저장을 검증하면서 브라우저 캔버스와 원본 페이지 렌더링만 대체한다.
function fixture(firstPage = { width: 300, height: 400 }) {
  const fillRect = vi.fn()
  const cleanup = vi.fn()
  const rendered: Array<{ width: number; height: number }> = []
  const render = vi.fn(({ canvas }: { canvas: { width: number; height: number } }) => {
    rendered.push({ width: canvas.width, height: canvas.height })
    return { promise: Promise.resolve() }
  })
  const canvases: Array<{ width: number; height: number }> = []
  const source = {
    numPages: 2,
    getPage: vi.fn(async (number: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: (number === 1 ? firstPage.width : 400) * scale,
        height: (number === 1 ? firstPage.height : 300) * scale,
      }),
      render,
      cleanup,
    })),
  } as unknown as PDFDocumentProxy
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), (char) => char.charCodeAt(0))
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas = {
        width: 0, height: 0,
        getContext: () => ({ fillRect, save: vi.fn(), restore: vi.fn(), setTransform: vi.fn() }),
        toBlob: (callback: (blob: Blob) => void) => callback(new Blob([png], { type: 'image/png' })),
      }
      canvases.push(canvas)
      return canvas
    },
  })
  return { source, fillRect, render, canvases, cleanup, rendered }
}

// 다음 검증에 브라우저 대체 객체가 남지 않게 복원한다.
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })

describe('가린 PDF 저장', () => {
  it('모든 페이지를 다시 그려 원래 크기와 페이지 수를 유지한다', async () => {
    const { source, fillRect, render, canvases } = fixture()
    const progress = vi.fn()
    const blob = await exportMaskedPdf(source, [region], { onProgress: progress })
    const result = await PDFDocument.load(await blob.arrayBuffer())
    expect(blob.type).toBe('application/pdf')
    expect(result.getPages().map((page) => page.getSize())).toEqual([
      { width: 300, height: 400 }, { width: 400, height: 300 },
    ])
    expect(render).toHaveBeenCalledTimes(2)
    expect(fillRect).toHaveBeenCalledExactlyOnceWith(19, 39, 83, 27)
    expect(progress.mock.calls).toEqual([[1, 2], [2, 2]])
    expect(canvases.every((canvas) => canvas.width === 0 && canvas.height === 0)).toBe(true)
    expect(result.getForm().getFields()).toHaveLength(0)
  })

  it('페이지마다 렌더링 자원을 해제한다', async () => {
    const { source, render, cleanup } = fixture()
    await exportMaskedPdf(source, [region])
    expect(cleanup).toHaveBeenCalledTimes(2)
    render.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('렌더링 실패')) }))
    await expect(exportMaskedPdf(source, [region])).rejects.toThrow('렌더링 실패')
    expect(cleanup).toHaveBeenCalledTimes(3)
  })

  it('큰 페이지는 해당 페이지의 배율만 낮춰 저장한다', async () => {
    // A0 크기는 기본 배율 2에서 캔버스 한도를 넘는다.
    const { source, fillRect, rendered } = fixture({ width: 2384, height: 3370 })
    const blob = await exportMaskedPdf(source, [{ pageNumber: 1, x: 100, y: 100, width: 50, height: 20 }])
    const result = await PDFDocument.load(await blob.arrayBuffer())
    expect(result.getPage(0).getSize()).toEqual({ width: 2384, height: 3370 })
    expect(rendered[0].width * rendered[0].height).toBeLessThanOrEqual(16_000_000)
    expect(rendered[1]).toEqual({ width: 800, height: 600 })
    // 낮춘 배율에 맞춰 가림 영역도 같은 비율로 칠한다.
    const [left, , w] = fillRect.mock.calls[0]
    const pageScale = rendered[0].width / 2384
    expect(left).toBeLessThanOrEqual(100 * pageScale)
    expect(left + w).toBeGreaterThanOrEqual(150 * pageScale)
    expect(left + w).toBeLessThan(150 * 2)
  })

  it('선택 영역이 없어도 원본 대신 이미지 페이지로 저장한다', async () => {
    const { source, fillRect, render } = fixture()
    await exportMaskedPdf(source, [])
    expect(render).toHaveBeenCalledTimes(2)
    expect(fillRect).not.toHaveBeenCalled()
  })

  it.each([
    { ...region, pageNumber: 0 }, { ...region, pageNumber: 3 },
    { ...region, x: NaN }, { ...region, y: -1 }, { ...region, width: 0 },
  ])('잘못된 영역이면 저장을 중단한다: %j', async (invalid) => {
    const { source, render } = fixture()
    await expect(exportMaskedPdf(source, [invalid])).rejects.toThrow('올바르지')
    expect(render).not.toHaveBeenCalled()
  })

  it('페이지 밖의 영역을 무시하지 않고 오류로 처리한다', async () => {
    const { source } = fixture()
    await expect(exportMaskedPdf(source, [{ ...region, x: 290 }])).rejects.toThrow('벗어났습니다')
  })

  it('렌더링 실패 시 결과를 반환하지 않고 캔버스를 해제한다', async () => {
    const { source, render, canvases } = fixture()
    render.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('렌더링 실패')) }))
    await expect(exportMaskedPdf(source, [region])).rejects.toThrow('렌더링 실패')
    expect(canvases[0]).toMatchObject({ width: 0, height: 0 })
  })

  it('과도한 저장 배율을 거부한다', async () => {
    const { source } = fixture()
    await expect(exportMaskedPdf(source, [], { scale: Infinity })).rejects.toThrow('배율')
  })

  it('다운로드 파일명과 임시 주소의 해제를 검증한다', async () => {
    const { source } = fixture()
    vi.useFakeTimers()
    const createElement = document.createElement
    const link = { href: '', download: '', click: vi.fn(), remove: vi.fn() }
    vi.stubGlobal('document', {
      createElement: (tag: string) => tag === 'a' ? link : createElement.call(document, tag),
      body: { appendChild: vi.fn() },
    })
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:검증')
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    await downloadMaskedPdf(source, [region], '가림 결과')
    expect(createUrl).toHaveBeenCalledOnce()
    expect(link.download).toBe('가림 결과.pdf')
    expect(link.click).toHaveBeenCalledOnce()
    expect(link.remove).toHaveBeenCalledOnce()
    expect(revokeUrl).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:검증')
  })

  it('저장 실패 시 다운로드를 시작하지 않는다', async () => {
    const { source, render } = fixture()
    render.mockImplementationOnce(() => ({ promise: Promise.reject(new Error('페이지 오류')) }))
    const createUrl = vi.spyOn(URL, 'createObjectURL')
    await expect(downloadMaskedPdf(source, [region])).rejects.toThrow('페이지 오류')
    expect(createUrl).not.toHaveBeenCalled()
  })
})
