import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'

// 실제 내려받은 파일의 모든 쪽에서 텍스트층·주석·첨부를 검사한다.
async function checkDownloadedPdf() {
  const bytes = readFileSync(process.argv[2])
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 })
  try {
    const doc = await task.promise
    if (await doc.getAttachments()) throw new Error('첨부가 남았습니다.')
    if (await doc.getJSActions()) throw new Error('문서 동작이 남았습니다.')
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      if ((await page.getTextContent()).items.length) throw new Error('텍스트층이 남았습니다.')
      if ((await page.getAnnotations()).length) throw new Error('주석이 남았습니다.')
      const operators = await page.getOperatorList()
      if (!operators.fnArray.some(op => [OPS.paintImageXObject, OPS.paintInlineImageXObject].includes(op))) throw new Error('페이지 이미지가 없습니다.')
    }
    console.log(`내려받은 문서 구조 검사 통과: ${doc.numPages}쪽, 텍스트층·주석·첨부·문서 동작 없음.`)
    console.log(`파일 검증값: ${createHash('sha256').update(bytes).digest('hex')}`)
    console.log('가림 위치의 픽셀과 남겨야 할 내용은 원본과 별도 시각 대조해야 합니다.')
  } finally { await task.destroy() }
}

// 실패한 파일의 내용·속성·전체 오류를 결과물에 출력하지 않는다.
checkDownloadedPdf().catch(() => {
  console.error('내려받은 문서 검사 실패: 입력 경로와 텍스트층·이미지·주석·첨부를 확인하세요.')
  process.exitCode = 1
})
