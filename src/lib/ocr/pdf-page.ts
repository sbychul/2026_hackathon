import type { OPS } from 'pdfjs-dist'
import type { TextContent, TextItem, PDFPageProxy } from 'pdfjs-dist/types/src/display/api'
import type { OcrBox, OcrLine } from './types'

// 실제 그리기 명령에 이미지가 있는 페이지만 글자 인식 모델 대상으로 고른다.
export function hasPageImages(operators: readonly number[], ops: typeof OPS): boolean {
  const imageOperations = new Set([
    ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageXObjectRepeat,
    ops.paintInlineImageXObjectGroup, ops.paintImageMaskXObject, ops.paintImageMaskXObjectGroup,
    ops.paintImageMaskXObjectRepeat, ops.paintSolidColorImageMask,
  ])
  return operators.some(operation => imageOperations.has(operation))
}

// 두 사각형을 모두 포함하는 보수적인 가림 영역을 만든다.
function union(a: OcrBox, b: OcrBox): OcrBox {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y)
  return { x, y, width: Math.max(a.x+a.width,b.x+b.width)-x, height: Math.max(a.y+a.height,b.y+b.height)-y }
}

// 인식용 정방향 좌표를 원래 페이지 회전이 적용된 저장 좌표로 옮긴다.
export function rotatedPageBox(box: OcrBox, source: ReturnType<PDFPageProxy['getViewport']>, target: ReturnType<PDFPageProxy['getViewport']>): OcrBox {
  const points = [[box.x,box.y],[box.x+box.width,box.y],[box.x,box.y+box.height],[box.x+box.width,box.y+box.height]]
    .map(([x,y])=>source.convertToPdfPoint(x,y))
    .map(([x,y])=>target.convertToViewportPoint(x,y))
  const x = Math.max(0,Math.min(...points.map(point=>point[0])))
  const y = Math.max(0,Math.min(...points.map(point=>point[1])))
  const right = Math.min(target.width,Math.max(...points.map(point=>point[0])))
  const bottom = Math.min(target.height,Math.max(...points.map(point=>point[1])))
  if (![x,y,right,bottom].every(Number.isFinite) || right<=x || bottom<=y) throw new Error('회전한 가림 영역이 올바르지 않습니다.')
  return {x,y,width:right-x,height:bottom-y}
}

// PDF에 저장된 글자의 변환 행렬과 글꼴 높이로 기본 배율의 화면 영역을 구한다.
export function nativeTextLines(content: TextContent, viewport: ReturnType<PDFPageProxy['getViewport']>): OcrLine[] {
  const lines: OcrLine[] = []
  let previous: TextItem | undefined
  for (const entry of content.items) {
    if (!('str' in entry)) continue
    if (!entry.str.trim()) { if (entry.hasEOL) previous = undefined; continue }
    const [a,b,c,d,e,f] = entry.transform as number[]
    const length = Math.hypot(a,b)
    if (![a,b,c,d,e,f,entry.width,entry.height].every(Number.isFinite) || length <= 0 || entry.dir === 'ttb') {
      throw new Error('직접 읽을 수 없는 글자 방향이나 좌표입니다. 해당 페이지를 확인해 주세요.')
    }
    const style = content.styles[entry.fontName]
    const ascent = Math.max(1, style?.ascent ?? 1), descent = Math.min(-.25, style?.descent ?? -.25)
    const corners = [
      [e+c*ascent, f+d*ascent], [e+c*descent, f+d*descent],
      [e+a/length*entry.width+c*ascent, f+b/length*entry.width+d*ascent],
      [e+a/length*entry.width+c*descent, f+b/length*entry.width+d*descent],
    ].map(([x,y]) => viewport.convertToViewportPoint(x,y))
    const left = Math.max(0,Math.min(...corners.map(point=>point[0]))-1)
    const top = Math.max(0,Math.min(...corners.map(point=>point[1]))-1)
    const right = Math.min(viewport.width,Math.max(...corners.map(point=>point[0]))+1)
    const bottom = Math.min(viewport.height,Math.max(...corners.map(point=>point[1]))+1)
    if (right <= left || bottom <= top) throw new Error('글자 영역이 페이지 밖에 있습니다.')
    const box = { x:left, y:top, width:right-left, height:bottom-top }
    let joined = false
    if (previous && !previous.hasEOL && lines.length) {
      const [pa,pb,,,pe,pf] = previous.transform as number[]
      const previousSize = Math.hypot(pa,pb)
      const ux = pa/previousSize, uy = pb/previousSize
      const dx = e-pe, dy = f-pf
      const gap = dx*ux+dy*uy-previous.width
      const baselineGap = Math.abs(-dx*uy+dy*ux)
      // 번호를 구성하는 가까운 글자 조각만 이어 붙이고 표의 떨어진 셀은 분리한다.
      if (baselineGap < Math.min(length,previousSize)*.3 && gap >= -1 && gap <= Math.min(length,previousSize)*.3
        && Math.abs(a/length-ux)+Math.abs(b/length-uy) < .1) {
        const line = lines[lines.length-1]
        line.text += entry.str
        line.box = union(line.box,box)
        joined = true
      }
    }
    if (!joined) lines.push({ text:entry.str, confidence:1, box })
    previous = entry
  }
  return lines
}
