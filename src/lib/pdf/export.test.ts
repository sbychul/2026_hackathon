import { afterEach, describe, expect, it, vi } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { exportMaskedPdf, type PdfMaskRegion } from './export'

const region: PdfMaskRegion = { pageNumber: 1, x: 10.25, y: 20.25, width: 40, height: 12 }

// 실제 PDF 저장을 검증하면서 브라우저 캔버스와 원본 페이지 렌더링만 대체한다.
function fixture() {
  const fillRect = vi.fn()
  const render = vi.fn(() => ({ promise: Promise.resolve() }))
  const canvases: Array<{ width: number; height: number }> = []
  const source = {
    numPages: 2,
    getPage: vi.fn(async (number: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({
        width: (number === 1 ? 300 : 400) * scale,
        height: (number === 1 ? 400 : 300) * scale,
      }),
      render,
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
  return { source, fillRect, render, canvases }
}

// 다음 검증에 브라우저 대체 객체가 남지 않게 복원한다.
afterEach(() => vi.unstubAllGlobals())

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
})
