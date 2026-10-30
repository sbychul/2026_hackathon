import { describe, expect, it } from 'vitest'
import { pageBox, detectionBoxes } from '../ocr/geometry'
import { decodeText } from '../ocr/preprocess'
import { privacyRegions } from '../ocr/privacy-regions'

describe('스캔 문서의 전화번호 가림 영역', () => {
  it('반복 숫자 사이의 빈 토큰은 제거하되 전화번호의 반복 숫자는 유지한다', () => {
    const dictionary = ['', '0', '1', '-']
    const tokens = [1, 1, 0, 2, 0, 1, 0, 3, 0, 1, 0, 1]
    const values = new Float32Array(tokens.length * dictionary.length)
    tokens.forEach((token, i) => { values[i * dictionary.length + token] = 1 })
    expect(decodeText(values, tokens.length, dictionary.length, dictionary).text).toBe('010-00')
  })

  it('실제 프로젝트 규칙으로 전화번호를 고르고 이미 가린 번호는 보존한다', () => {
    const box = { x: 200, y: 400, width: 300, height: 50 }
    const result = privacyRegions([
      { text: '전화: 010-1234-5678 / 010-2345-6789', confidence: 0.95, box },
      { text: '연락처 010-****-5678', confidence: 0.95, box: { ...box, y: 500 } },
      { text: '홍길동', confidence: 0.99, box: { ...box, y: 600 } },
    ], 2, 1200, 1800, 600, 900)
    expect(result.count).toBe(2)
    expect(result.regions).toEqual([{ pageNumber: 2, x: 98, y: 198, width: 154, height: 29 }])
  })

  it('가로로 회전된 페이지도 실제 렌더링 크기와 같은 비율로 변환한다', () => {
    expect(pageBox({ x: 900, y: 300, width: 300, height: 60 }, 1800, 1200, 900, 600))
      .toEqual({ x: 448, y: 148, width: 154, height: 34 })
  })

  it('여유 영역을 페이지 경계 안으로 제한한다', () => {
    expect(pageBox({ x: 0, y: 0, width: 100, height: 200 }, 100, 200, 50, 100))
      .toEqual({ x: 0, y: 0, width: 50, height: 100 })
  })

  it('잘못된 좌표를 개인정보 없음으로 바꾸지 않고 거부한다', () => {
    expect(() => pageBox({ x: NaN, y: 0, width: 10, height: 10 }, 100, 100, 50, 50)).toThrow()
    expect(() => pageBox({ x: 0, y: 0, width: 10, height: 10 }, 0, 100, 50, 50)).toThrow()
    expect(() => decodeText(new Float32Array(3), 1, 3, ['', '가'])).toThrow()
  })

  it('검출 지도에서 떨어진 두 영역을 별개로 유지한다', () => {
    const map = new Float32Array(32 * 32)
    for (let y = 3; y < 8; y++) for (let x = 2; x < 12; x++) map[y * 32 + x] = .9
    for (let y = 20; y < 25; y++) for (let x = 10; x < 25; x++) map[y * 32 + x] = .9
    const boxes = detectionBoxes(map, 32, 32, 320, 320)
    expect(boxes).toHaveLength(2)
    expect(boxes[0].y + boxes[0].height).toBeLessThan(boxes[1].y)
    expect(boxes.every(box => box.width > 0 && box.height > 0)).toBe(true)
  })
})
