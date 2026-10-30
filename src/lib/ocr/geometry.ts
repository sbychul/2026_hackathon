import type { OcrBox } from './types'

// 검출 확률 지도에서 연결된 글자 영역을 찾아 원본 이미지의 사각형으로 환산한다.
export function detectionBoxes(probabilities: Float32Array, width: number, height: number, originalWidth: number, originalHeight: number): OcrBox[] {
  if (probabilities.length !== width * height) throw new Error('글자 검출 결과의 크기가 올바르지 않습니다.')
  const visited = new Uint8Array(width * height)
  const queue = new Int32Array(width * height)
  const boxes: OcrBox[] = []
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || probabilities[start] <= 0.3) continue
    let head = 0, tail = 1, count = 0, sum = 0
    queue[0] = start
    visited[start] = 1
    let left = width, top = height, right = 0, bottom = 0
    while (head < tail) {
      const index = queue[head++]
      const x = index % width, y = Math.floor(index / width)
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
      count++; sum += probabilities[index]
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue
        const next = ny * width + nx
        if (!visited[next] && probabilities[next] > 0.3) { visited[next] = 1; queue[tail++] = next }
      }
    }
    const w = right - left + 1, h = bottom - top + 1
    if (count < 8 || Math.min(w, h) < 3 || sum / count < 0.5) continue
    // 수평 인쇄 자료의 축소된 검출 영역에 높이 비례 여유를 주어 글자 가장자리를 포함한다.
    const margin = w * h * 1.6 / (2 * (w + h))
    const x = Math.max(0, left - margin) * originalWidth / width
    const y = Math.max(0, top - margin) * originalHeight / height
    const endX = Math.min(width, right + 1 + margin) * originalWidth / width
    const endY = Math.min(height, bottom + 1 + margin) * originalHeight / height
    boxes.push({ x, y, width: endX - x, height: endY - y })
    if (boxes.length > 500) throw new Error('한 쪽의 글자 영역이 너무 많습니다. 더 작은 문서로 나눠 주세요.')
  }
  return boxes.sort((a, b) => a.y - b.y || a.x - b.x)
}

// 같은 방향으로 렌더링된 이미지 좌표를 저장 함수의 기본 배율 페이지 좌표로 바꾼다.
export function pageBox(box: OcrBox, imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number): OcrBox {
  if (![imageWidth, imageHeight, pageWidth, pageHeight].every(value => Number.isFinite(value) && value > 0)
    || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
    throw new Error('글자 영역의 좌표가 올바르지 않습니다.')
  }
  const x = Math.max(0, box.x - 4) / imageWidth * pageWidth
  const y = Math.max(0, box.y - 4) / imageHeight * pageHeight
  const right = Math.min(imageWidth, box.x + box.width + 4) / imageWidth * pageWidth
  const bottom = Math.min(imageHeight, box.y + box.height + 4) / imageHeight * pageHeight
  if (right <= x || bottom <= y) throw new Error('글자 영역이 페이지 밖에 있습니다.')
  return { x, y, width: right - x, height: bottom - y }
}
