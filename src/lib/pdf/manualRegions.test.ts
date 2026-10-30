import { describe, expect, it } from 'vitest'
import { createManualRegion, displaySize, toStoredPoint, type QuarterTurn } from './manualRegions'

describe('직접 영역의 저장 좌표', () => {
  const page = { width: 600, height: 800 }
  for (const zoom of [0.5, 1, 1.25, 2]) {
    for (const rotation of [0, 90, 180, 270] as QuarterTurn[]) {
      it(`${rotation}도 회전과 ${zoom}배 표시에서 동일 영역을 저장한다`, () => {
        const size = displaySize(page, rotation)
        const bounds = { width: size.width * zoom, height: size.height * zoom }
        // 저장 좌표의 (100, 200), (300, 400)에 대응하는 표시 좌표다.
        const points = {
          0: [{ x: 100, y: 200 }, { x: 300, y: 400 }],
          90: [{ x: 600, y: 100 }, { x: 400, y: 300 }],
          180: [{ x: 500, y: 600 }, { x: 300, y: 400 }],
          270: [{ x: 200, y: 500 }, { x: 400, y: 300 }],
        }[rotation].map((point) => toStoredPoint({ x: point.x * zoom, y: point.y * zoom }, bounds, page, rotation))
        expect(createManualRegion(points[0], points[1], page, 2, '영역')).toEqual({ id: '영역', pageNumber: 2, x: 100, y: 200, width: 200, height: 200 })
      })
    }
  }
  it('역방향 드래그와 페이지 밖 포인터를 페이지 경계로 제한한다', () => {
    expect(createManualRegion({ x: 900, y: 900 }, { x: -50, y: -30 }, page, 1, '영역')).toEqual({ id: '영역', pageNumber: 1, x: 0, y: 0, width: 600, height: 800 })
    expect(toStoredPoint({ x: -100, y: 900 }, page, page, 90)).toEqual({ x: 600, y: 800 })
  })
  it('클릭이나 잘못된 좌표를 저장하지 않는다', () => {
    expect(createManualRegion({ x: 10, y: 10 }, { x: 10.5, y: 20 }, page, 1, '영역')).toBeNull()
    expect(createManualRegion({ x: NaN, y: 10 }, { x: 30, y: 20 }, page, 1, '영역')).toBeNull()
    expect(() => toStoredPoint({ x: 10, y: 10 }, { width: 0, height: 100 }, page, 0)).toThrow()
  })
})
