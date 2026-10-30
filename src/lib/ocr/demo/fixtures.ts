import { PDFDocument, StandardFonts, degrees } from 'pdf-lib'

export type ExampleKind = 'scan' | 'text' | 'mixed' | 'rotated'

// 실제 개인정보 없이 페이지 분기와 가림을 재현할 수 있는 가짜 문서를 기기 안에서 만든다.
export async function examplePdf(kind: ExampleKind): Promise<File> {
  const pdf = await PDFDocument.create()
  const font = await pdf.embedFont(StandardFonts.Helvetica)
  const count = kind === 'text' || kind === 'mixed' ? 30 : kind === 'rotated' ? 2 : 1
  for (let index = 0; index < count; index++) {
    const page = pdf.addPage([595,842])
    const scanned = kind === 'scan' || kind === 'rotated' || (kind === 'mixed' && index === 15)
    if (scanned) {
      const canvas = document.createElement('canvas')
      canvas.width=1654; canvas.height=2339
      const context = canvas.getContext('2d')!
      context.fillStyle='#ffffff'; context.fillRect(0,0,canvas.width,canvas.height)
      context.fillStyle='#000000'; context.font='44px sans-serif'
      context.fillText('가상 연락처 · 시험용 문서',120,170)
      context.font='36px sans-serif'
      const rows = ['김가온 010-0000-3101','이가람 010-0000-3102','박나래 010-0000-3103','이미 가린 번호 010-****-3104']
      rows.forEach((text,row)=>context.fillText(text,120,350+row*160))
      context.fillText('이 문서의 연락처는 가짜 시험 자료입니다.',120,1200)
      const image = await pdf.embedPng(canvas.toDataURL('image/png'))
      page.drawImage(image,{x:0,y:0,width:595,height:842})
      if (kind === 'rotated' && index === 1) page.setRotation(degrees(90))
      canvas.width=0; canvas.height=0
    } else {
      page.drawText(`Synthetic page ${index+1}`,{x:60,y:770,size:20,font})
      page.drawText('Phone: 010-0000-3201',{x:60,y:680,size:16,font})
      page.drawText('Masked: 010-****-3202',{x:60,y:640,size:16,font})
    }
  }
  return new File([new Uint8Array(await pdf.save())],`가짜-${kind}-예제.pdf`,{type:'application/pdf'})
}
