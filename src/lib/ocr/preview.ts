// 이미 가린 캔버스를 문서의 원래 방향으로 돌려 다운로드와 같은 방향의 미리보기를 만든다.
export function maskedPreview(canvas: HTMLCanvasElement, rotation: number): string {
  const angle=((rotation%360)+360)%360
  if (angle===0) return canvas.toDataURL('image/png')
  if (![90,180,270].includes(angle)) throw new Error('문서 회전값이 올바르지 않습니다.')
  const preview=document.createElement('canvas')
  preview.width=angle===180?canvas.width:canvas.height
  preview.height=angle===180?canvas.height:canvas.width
  try {
    const context=preview.getContext('2d')
    if (!context) throw new Error('미리보기를 그릴 수 없습니다.')
    if (angle===90) context.setTransform(0,1,-1,0,canvas.height,0)
    else if (angle===180) context.setTransform(-1,0,0,-1,canvas.width,canvas.height)
    else context.setTransform(0,-1,1,0,0,canvas.width)
    context.drawImage(canvas,0,0)
    return preview.toDataURL('image/png')
  } finally { preview.width=0;preview.height=0 }
}
