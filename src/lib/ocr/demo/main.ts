import { scanPdfPhones, type ScannedPdfResult } from '../../pdf/ocr'
import { downloadMaskedPdf } from '../../pdf/export'
import './style.css'
import { examplePdf, type ExampleKind } from './fixtures'

const file = document.querySelector<HTMLInputElement>('#file')!
const start = document.querySelector<HTMLButtonElement>('#start')!
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!
const download = document.querySelector<HTMLButtonElement>('#download')!
const status = document.querySelector<HTMLElement>('#status')!
const pages = document.querySelector<HTMLElement>('#pages')!
const details = document.querySelector<HTMLElement>('#details')!
const example = document.querySelector<HTMLSelectElement>('#example')!
const loadExample = document.querySelector<HTMLButtonElement>('#load-example')!
let result: ScannedPdfResult | undefined, controller: AbortController | undefined
let selectedFile: File | undefined

// 이전 문서와 화면에 남은 원문을 해제한다.
async function clearResult() {
  download.disabled = true
  const previous = result; result = undefined
  pages.replaceChildren(); details.textContent = ''
  await previous?.source.loadingTask.destroy()
}

// 파일 변경 시 이전 결과를 버리고 실행 가능 상태를 갱신한다.
file.addEventListener('change', async () => {
  controller?.abort()
  await clearResult()
  selectedFile = file.files?.[0]
  start.disabled = !file.files?.length
  status.textContent = file.files?.length ? '문서를 선택했습니다. 첫 실행은 모델 준비 시간이 필요합니다.' : '문서를 선택해 주세요.'
})

// 가짜 예제도 실제 파일 선택과 같은 처리 경로를 거치도록 준비한다.
loadExample.addEventListener('click', async () => {
  loadExample.disabled=true; start.disabled=true; file.disabled=true
  try {
    await clearResult()
    selectedFile=await examplePdf(example.value as ExampleKind)
    file.value=''
    status.textContent=`${example.selectedOptions[0].text} 예제를 기기 안에서 준비했습니다.`
    start.disabled=false
  } catch { selectedFile=undefined; status.textContent='가짜 예제를 만들지 못했습니다.' }
  finally { loadExample.disabled=false; file.disabled=false }
})

// 모델 준비와 인식 진행을 표시하고 완성된 결과만 다운로드 가능하게 만든다.
start.addEventListener('click', async () => {
  const input = selectedFile
  if (!input) return
  start.disabled = true; file.disabled = true; cancel.disabled = false; loadExample.disabled=true
  controller = new AbortController()
  const started = performance.now()
  try {
    await clearResult()
    status.textContent = '문서를 기기 안에서 여는 중입니다.'
    result = await scanPdfPhones(input, { signal: controller.signal, onProgress: (page, total, progress) => {
      const phase = progress.stage === 'inspect' ? '이미지 포함 여부 확인 중' : progress.stage === 'text' ? '모델 없이 글자 직접 읽는 중' : progress.stage === 'models' ? '공개 모델 준비 중' : progress.stage === 'detect' ? '글자 위치 찾는 중' : `글자 읽는 중 ${progress.completed}/${progress.total}`
      status.textContent = `${page}/${total}쪽 · ${phase}`
    } })
    for (const page of result.pages) {
      if (!page.preview) continue
      const image = document.createElement('img')
      image.src = page.preview; image.alt = `${page.pageNumber}쪽의 전화번호를 가린 결과`
      pages.appendChild(image)
    }
    details.textContent = JSON.stringify({ count: result.count, ocrPages:result.ocrPages, directPages:result.directPages, regions: result.regions, pages: result.pages.map(({preview:_preview,...page}) => page) }, null, 2)
    const warnings = result.pages.filter(page=>page.warning).map(page=>`${page.pageNumber}쪽: ${page.warning}`).join(' ')
    status.textContent = `완료 · ${result.pages.length}쪽 · 모델 사용 ${result.ocrPages}쪽 / 직접 읽기 ${result.directPages}쪽 · 전화번호 ${result.count}건 · ${((performance.now()-started)/1000).toFixed(1)}초${result.count ? '' : ' · 번호를 찾지 못했습니다. 개인정보가 없다는 뜻은 아닙니다.'}${warnings ? ' · '+warnings : ''}`
    download.disabled = result.count === 0
  } catch {
    status.textContent = controller.signal.aborted ? '작업을 취소했습니다. 다시 실행할 수 있습니다.' : '처리에 실패했습니다. 모델 파일, 문서 형식 또는 브라우저 지원 여부를 확인해 주세요. 개인정보가 없다는 뜻은 아닙니다.'
    await clearResult()
  } finally { cancel.disabled = true; start.disabled = false; file.disabled = false; loadExample.disabled=false }
})

// 현재 진행 중인 글자 인식을 중단한다.
cancel.addEventListener('click', () => controller?.abort())

// 가린 픽셀로 새 문서를 만들고 원본 문서와 별도 파일로 내려받는다.
download.addEventListener('click', async () => {
  if (!result) return
  download.disabled = true; start.disabled = true; file.disabled = true; loadExample.disabled=true
  try {
    await downloadMaskedPdf(result.source, result.regions, '전화번호를-가린-문서.pdf', { onProgress: (done, total) => { status.textContent = `가린 문서 만드는 중 ${done}/${total}쪽` } })
    status.textContent = `다운로드 완료 · 전화번호 ${result.count}건을 가린 새 문서입니다.`
  } catch { status.textContent = '문서 저장에 실패했습니다. 원본은 내려받지 않았습니다.' }
  finally { download.disabled = false; start.disabled = false; file.disabled = false; loadExample.disabled=false }
})
