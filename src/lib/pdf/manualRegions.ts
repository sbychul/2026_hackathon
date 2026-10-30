import type { PdfMaskRegion } from './export'

export interface Point { x: number; y: number }
export interface PageSize { width: number; height: number }
export type QuarterTurn = 0 | 90 | 180 | 270
export interface ManualRegion extends PdfMaskRegion { id: string }

// 추가 화면 회전을 적용한 페이지 크기를 구한다.
export function displaySize(page: PageSize, rotation: QuarterTurn): PageSize {
  return rotation === 90 || rotation === 270 ? { width: page.height, height: page.width } : page
}

// 화면상의 점을 기본 회전과 배율 1이 적용된 저장 좌표로 되돌린다.
export function toStoredPoint(point: Point, bounds: PageSize, page: PageSize, rotation: QuarterTurn): Point {
  if (![bounds.width, bounds.height, page.width, page.height].every((value) => Number.isFinite(value) && value > 0)
    || ![point.x, point.y].every(Number.isFinite)) throw new Error('페이지 크기와 좌표를 확인해 주세요.')
  const size = displaySize(page, rotation)
  const x = Math.max(0, Math.min(1, point.x / bounds.width)) * size.width
  const y = Math.max(0, Math.min(1, point.y / bounds.height)) * size.height
  switch (rotation) {
    case 90: return { x: y, y: page.height - x }
    case 180: return { x: page.width - x, y: page.height - y }
    case 270: return { x: page.width - y, y: x }
    default: return { x, y }
  }
}

// 어느 방향으로 드래그해도 페이지 내부의 양수 크기 영역으로 정리한다.
export function createManualRegion(start: Point, end: Point, page: PageSize, pageNumber: number, id: string): ManualRegion | null {
  if (![start.x, start.y, end.x, end.y, page.width, page.height].every(Number.isFinite)
    || page.width <= 0 || page.height <= 0 || !Number.isInteger(pageNumber) || pageNumber < 1) return null
  const left = Math.max(0, Math.min(page.width, Math.min(start.x, end.x)))
  const top = Math.max(0, Math.min(page.height, Math.min(start.y, end.y)))
  const right = Math.max(0, Math.min(page.width, Math.max(start.x, end.x)))
  const bottom = Math.max(0, Math.min(page.height, Math.max(start.y, end.y)))
  if (right - left < 1 || bottom - top < 1) return null
  return { id, pageNumber, x: left, y: top, width: right - left, height: bottom - top }
}

// 기존 이미지와 영역을 같은 방향으로 회전하는 변환을 반환한다.
export function rotationTransform(page: PageSize, rotation: QuarterTurn): string {
  switch (rotation) {
    case 90: return `translate(${page.height} 0) rotate(90)`
    case 180: return `translate(${page.width} ${page.height}) rotate(180)`
    case 270: return `translate(0 ${page.width}) rotate(270)`
    default: return ''
  }
}
