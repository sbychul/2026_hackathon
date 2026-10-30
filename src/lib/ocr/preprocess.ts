import type { OcrBox } from './types'

// 원본 또는 글자 영역을 색상 순서와 정규화 규격에 맞는 입력 배열로 변환한다.
export function normalizedImage(image: ImageBitmap, width: number, height: number, crop?: OcrBox, contentWidth = width): Float32Array {
  const canvas = new OffscreenCanvas(contentWidth, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('브라우저가 이미지 처리를 지원하지 않습니다.')
  if (crop) context.drawImage(image, crop.x, crop.y, crop.width, crop.height, 0, 0, contentWidth, height)
  else context.drawImage(image, 0, 0, contentWidth, height)
  const pixels = context.getImageData(0, 0, contentWidth, height).data
  const output = new Float32Array(3 * height * width)
  for (let y = 0; y < height; y++) for (let x = 0; x < contentWidth; x++) {
    const input = (y * contentWidth + x) * 4, offset = y * width + x
    for (let channel = 0; channel < 3; channel++) output[channel * height * width + offset] = pixels[input + 2 - channel] / 127.5 - 1
  }
  canvas.width = 0; canvas.height = 0
  return output
}

// 중복 토큰과 공백 토큰을 구분해 인식 결과를 문자열로 복원한다.
export function decodeText(data: Float32Array, steps: number, classes: number, dictionary: string[]): { text: string; confidence: number } {
  if (classes !== dictionary.length || data.length !== steps * classes) throw new Error('글자 사전과 모델 출력 규격이 일치하지 않습니다.')
  let text = '', previous = -1, sum = 0, count = 0
  for (let t = 0; t < steps; t++) {
    let best = 0, probability = -Infinity
    for (let c = 0; c < classes; c++) if (data[t * classes + c] > probability) { best = c; probability = data[t * classes + c] }
    if (best !== 0 && best !== previous) { text += dictionary[best]; sum += probability; count++ }
    previous = best
  }
  return { text, confidence: count ? sum / count : 0 }
}
