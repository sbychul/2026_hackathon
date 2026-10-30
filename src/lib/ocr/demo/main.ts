import { scanPdfPrivacy, type ScannedPdfResult } from '../../pdf/ocr'
import { downloadMaskedPdf } from '../../pdf/export'
import { RULES } from '../../../rules/rules'
import { resetModelProgress, showModelProgress, stopModelProgress } from './model-progress'
import './style.css'

const file = document.querySelector<HTMLInputElement>('#file')!
const start = document.querySelector<HTMLButtonElement>('#start')!
const cancel = document.querySelector<HTMLButtonElement>('#cancel')!
const download = document.querySelector<HTMLButtonElement>('#download')!
const status = document.querySelector<HTMLElement>('#status')!
const pages = document.querySelector<HTMLElement>('#pages')!
const details = document.querySelector<HTMLElement>('#details')!
const selection = document.querySelector<HTMLElement>('#selection')!
const drop = document.querySelector<HTMLElement>('#drop-zone')!
document.querySelector('#rule-list')!.textContent=RULES.map(rule=>rule.name).join(' · ')
let result: ScannedPdfResult | undefined, controller: AbortController | undefined
let selectedFile: File | undefined, busy=false

// 이전 결과와 원문을 해제한다.
async function clearResult(resetModels = true) {
  download.disabled = true
  const previous = result; result = undefined
  pages.replaceChildren(); details.replaceChildren()
  if (resetModels) resetModelProgress()
  await previous?.source.loadingTask.destroy()
}

// 처리 중에는 선택과 중복 실행을 막는다.
function setBusy(value:boolean):void {
  busy=value;file.disabled=value;start.disabled=value||!selectedFile
  download.disabled=value||!result?.count
  drop.setAttribute('aria-busy',String(value))
}

// 사용자가 첨부한 한 개의 PDF만 받아 이전 문서의 결과를 지운다.
async function selectFile(input:File|undefined):Promise<void> {
  if (busy) return
  selectedFile=undefined;setBusy(true)
  try {
    await clearResult()
    if (!input) {selection.textContent='선택한 파일이 없습니다.';status.textContent='PDF 파일을 첨부해 주세요.';return}
    if (!/\.pdf$/i.test(input.name)) {selection.textContent='PDF 파일만 첨부할 수 있습니다.';status.textContent='첨부 형식을 확인해 주세요.';file.value='';return}
    if (input.size>30*1024*1024) {selection.textContent='30메가바이트 이하의 PDF를 선택해 주세요.';status.textContent='파일 크기를 확인해 주세요.';file.value='';return}
    selectedFile=input
    selection.textContent=input.name+' · '+(input.size/1_000_000).toFixed(2)+'메가바이트'
    status.textContent='첨부 완료 · 개인정보 찾기를 누르면 공통 규칙 전체를 적용합니다.'
  } finally {setBusy(false)}
}

// 일반 파일 선택과 끌어다 놓기를 같은 입력 처리에 연결한다.
file.addEventListener('change',()=>{void selectFile(file.files?.[0])})
drop.addEventListener('dragover',event=>{event.preventDefault()})
drop.addEventListener('drop',event=>{
  event.preventDefault()
  if (busy) return
  if (event.dataTransfer?.files.length!==1) {status.textContent='PDF 파일을 한 개씩 첨부해 주세요.';return}
  file.value='';void selectFile(event.dataTransfer.files[0])
})

// 원문 대신 규칙별 건수와 페이지별 처리 방식만 결과 화면에 표시한다.
function showResult(value:ScannedPdfResult):void {
  const summary=document.createElement('p')
  summary.textContent=RULES.map(rule=>rule.name+' '+(value.counts[rule.id]??0)+'건').join(' · ')
  const methods=document.createElement('p')
  methods.textContent=value.pages.map(page=>page.pageNumber+'쪽: '+(page.method==='ocr'?'모델 사용':'직접 읽기')).join(' / ')
  details.append(summary,methods)
  for (const page of value.pages) {
    if (!page.preview) continue
    const image=document.createElement('img')
    image.src=page.preview;image.alt=page.pageNumber+'쪽의 탐지된 개인정보를 가린 결과'
    pages.append(image)
  }
}

// 공통 규칙으로 모든 페이지를 분석하고 완성된 결과만 저장할 수 있게 한다.
start.addEventListener('click',async()=>{
  const input=selectedFile
  if (!input || busy) return
  setBusy(true);cancel.disabled=false;controller=new AbortController()
  const started=performance.now()
  try {
    await clearResult()
    status.textContent='첨부 문서를 기기 안에서 여는 중입니다.'
    result=await scanPdfPrivacy(input,{signal:controller.signal,onProgress:(page,total,progress)=>{
      showModelProgress(progress)
      const phase=progress.stage==='inspect'?'이미지 포함 여부 확인 중':progress.stage==='text'?'모델 없이 직접 읽는 중':progress.stage==='models'?'모델 준비 중':progress.stage==='detect'?'글자 위치 찾는 중':'글자 읽는 중 '+progress.completed+'/'+progress.total
      status.textContent=page+'/'+total+'쪽 · '+phase
    }})
    showResult(result)
    const warnings=result.pages.filter(page=>page.warning).map(page=>page.pageNumber+'쪽: '+page.warning).join(' ')
    status.textContent='완료 · '+result.pages.length+'쪽 · 모델 사용 '+result.ocrPages+'쪽 / 직접 읽기 '+result.directPages+'쪽 · 개인정보 '+result.count+'건 · '+((performance.now()-started)/1000).toFixed(1)+'초'+(result.count?'':' · 탐지된 항목이 없습니다. 개인정보가 없다는 뜻은 아닙니다.')+(warnings?' · '+warnings:'')
  } catch {
    status.textContent=controller.signal.aborted?'작업을 취소했습니다. 다시 실행할 수 있습니다.':'문서를 처리하지 못했습니다. PDF 형식·암호 설정·100쪽 제한·모델 준비 상태를 확인해 주세요.'
    await clearResult(false);stopModelProgress(controller.signal.aborted)
  } finally {cancel.disabled=true;setBusy(false)}
})

// 진행 중인 분석을 중단한다.
cancel.addEventListener('click',()=>controller?.abort())

// 탐지된 영역을 실제 픽셀로 가린 새 문서만 내려받는다.
download.addEventListener('click',async()=>{
  if (!result || busy || !selectedFile) return
  setBusy(true)
  try {
    await downloadMaskedPdf(result.source,result.regions,selectedFile.name.replace(/\.pdf$/i,'')+'_개인정보가림.pdf',{onProgress:(done,total)=>{status.textContent='가린 문서 만드는 중 '+done+'/'+total+'쪽'}})
    status.textContent='다운로드 완료 · 개인정보 '+result.count+'건을 가린 새 문서입니다.'
  } catch {status.textContent='문서 저장에 실패했습니다. 원본은 내려받지 않았습니다.'}
  finally {setBusy(false)}
})
