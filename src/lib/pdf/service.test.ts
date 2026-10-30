import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readServicePdf } from './service'

const fake = vi.hoisted(() => ({ extract: vi.fn(), scan: vi.fn(), destroy: vi.fn() }))
vi.mock('./extract', async (importOriginal) => ({
  ...await importOriginal<typeof import('./extract')>(), extractPdf: fake.extract,
}))
vi.mock('./ocr', () => ({ scanPdfPrivacy: fake.scan }))

// 시험 페이지에서 원래 회전과 화면 좌표가 같은 배율을 제공한다.
function viewport() {
  return { width: 600, height: 800, rotation: 0 }
}

beforeEach(() => {
  vi.clearAllMocks()
  fake.extract.mockResolvedValue({ pages: [{ pageNumber: 1, width: 600, height: 800, text: '', spans: [], hasText: false }], emptyPages: [1], allEmpty: true })
  fake.scan.mockResolvedValue({
    source: { loadingTask: { destroy: fake.destroy }, getPage: async () => ({ getViewport: viewport }) },
    pages: [{ pageNumber: 1, method: 'ocr', imageWidth: 1200, imageHeight: 1600,
      lines: [{ text: '010-1234-5678', confidence: 1, box: { x: 100, y: 200, width: 240, height: 40 } }] }],
  })
})

describe('서비스 PDF 인식 연결', () => {
  it('글자 층이 없어도 모델 결과를 선택 가능한 가림 항목으로 연결한다', async () => {
    const result = await readServicePdf(new File(['pdf'], '스캔.pdf'))
    expect(fake.scan).toHaveBeenCalledOnce()
    expect(result.matches).toMatchObject([{ ruleId: 'phone', value: '010-1234-5678', pageNumber: 1,
      regions: [{ pageNumber: 1, x: 48, y: 98, width: 124, height: 24 }] }])
    expect(fake.destroy).toHaveBeenCalledOnce()
  })
  it('모델 실패를 개인정보 0건으로 반환하지 않는다', async () => {
    fake.scan.mockRejectedValue(new Error('모델을 내려받지 못했습니다.'))
    await expect(readServicePdf(new File(['pdf'], '스캔.pdf'))).rejects.toThrow('모델을 내려받지 못했습니다.')
  })
  it('혼합 문서는 저장된 글자와 모델 결과를 페이지별로 합친다', async () => {
    const native = { pageNumber: 2, width: 600, height: 800, text: 'person@example.com',
      spans: [], hasText: true, viewportTransform: [1, 0, 0, 1, 0, 0] }
    const extracted = await fake.extract()
    fake.extract.mockResolvedValue({ ...extracted, pages: [...extracted.pages, native] })
    const scanned = await fake.scan()
    fake.scan.mockResolvedValue({ ...scanned, pages: [...scanned.pages,
      { pageNumber: 2, method: 'text', lines: [{ text: 'person@example.com' }] }] })
    const result = await readServicePdf(new File(['pdf'], '혼합.pdf'))
    expect(result.matches.map(match => [match.pageNumber, match.ruleId])).toEqual([[1, 'phone'], [2, 'email']])
  })
  it('읽지 못한 페이지는 확인 필요 오류로 남기고 PDF 자원을 해제한다', async () => {
    const scanned = await fake.scan()
    fake.scan.mockResolvedValue({ ...scanned, pages: [{ ...scanned.pages[0], lines: [] }] })
    await expect(readServicePdf(new File(['pdf'], '빈쪽.pdf'))).rejects.toThrow('개인정보가 없다는 뜻은 아니에요')
    expect(fake.destroy).toHaveBeenCalledOnce()
  })
  it('취소된 파일은 모델 실행을 시작하지 않는다', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(readServicePdf(new File(['pdf'], '스캔.pdf'), { signal: controller.signal })).rejects.toThrow('취소')
    expect(fake.scan).not.toHaveBeenCalled()
  })
  it('회전된 페이지의 인식 영역을 원래 저장 방향으로 되돌린다', async () => {
    const scanned = await fake.scan()
    fake.scan.mockResolvedValue({ ...scanned, source: {
      ...scanned.source,
      getPage: async () => ({ getViewport: ({ rotation }: { rotation?: number }) => rotation === 0
        ? { width: 600, height: 800, rotation: 0, convertToPdfPoint: (x: number, y: number) => [x, y] }
        : { width: 800, height: 600, rotation: 90, convertToViewportPoint: (x: number, y: number) => [800 - y, x] } }),
    } })
    const result = await readServicePdf(new File(['pdf'], '회전.pdf'))
    expect(result.matches[0].regions).toEqual([{ pageNumber: 1, x: 678, y: 48, width: 24, height: 124 }])
  })
  it('취소 신호를 인식 모듈로 전달하고 성공 결과를 남기지 않는다', async () => {
    const controller = new AbortController()
    fake.scan.mockImplementation(async (_file, options) => {
      expect(options.signal).toBe(controller.signal)
      controller.abort()
      throw new Error('작업을 취소했습니다.')
    })
    await expect(readServicePdf(new File(['pdf'], '스캔.pdf'), { signal: controller.signal })).rejects.toThrow('취소')
  })
})
