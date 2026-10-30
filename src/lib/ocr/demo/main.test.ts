import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fake=vi.hoisted(()=>({scan:vi.fn(),download:vi.fn()}))
vi.mock('../../pdf/ocr',()=>({scanPdfPrivacy:fake.scan}))
vi.mock('../../pdf/export',()=>({downloadMaskedPdf:fake.download}))
vi.mock('./model-progress',()=>({resetModelProgress:vi.fn(),showModelProgress:vi.fn(),stopModelProgress:vi.fn()}))

// 화면의 실제 이벤트 처리 함수를 실행할 수 있는 최소 입력·버튼 대역을 만든다.
function element() {
  return {disabled:false,textContent:'',value:'',files:[] as File[],
    listeners:new Map<string,()=>unknown>(),
    addEventListener(type:string,listener:()=>unknown) {this.listeners.set(type,listener)},
    setAttribute:vi.fn(),replaceChildren:vi.fn(),append:vi.fn(),
  }
}
let elements:Record<string,ReturnType<typeof element>>

// 매 시험마다 새 화면을 연결해 이전 문서 상태가 섞이지 않게 한다.
beforeEach(async()=>{
  vi.resetModules();vi.clearAllMocks()
  elements=Object.fromEntries(['file','start','cancel','download','status','pages','details','selection','drop-zone','rule-list'].map(id=>['#'+id,element()]))
  vi.stubGlobal('document',{querySelector:(id:string)=>elements[id],createElement:element})
  await import('./main')
  elements['#file'].files=[new File(['시험'],'자료.pdf',{type:'application/pdf'})]
  elements['#file'].listeners.get('change')!()
  await vi.waitFor(()=>expect(elements['#start'].disabled).toBe(false))
})
// 브라우저 대역을 다른 검증에 남기지 않는다.
afterEach(()=>vi.unstubAllGlobals())

describe('분석 결과 다운로드 상태',()=>{
  it('0건 분석 완료 후에도 다운로드하고 새 파일을 선택하면 이전 결과를 막는다',async()=>{
    const result={count:0,counts:{},pages:[],ocrPages:0,directPages:1,regions:[],source:{loadingTask:{destroy:vi.fn()}}}
    fake.scan.mockResolvedValueOnce(result)
    await elements['#start'].listeners.get('click')!()
    expect(elements['#download'].disabled).toBe(false)
    expect(elements['#status'].textContent).toContain('개인정보가 없다는 뜻은 아닙니다')
    await elements['#download'].listeners.get('click')!()
    expect(fake.download).toHaveBeenCalledWith(result.source,[],'자료_개인정보가림.pdf',expect.any(Object))
    elements['#file'].listeners.get('change')!()
    expect(elements['#download'].disabled).toBe(true)
    await vi.waitFor(()=>expect(elements['#start'].disabled).toBe(false))
  })
  it('진행 중·취소·실패한 문서는 다운로드하지 못한다',async()=>{
    fake.scan.mockImplementationOnce((_file:File,{signal}:{signal:AbortSignal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('취소')))))
    const running=elements['#start'].listeners.get('click')!()
    await vi.waitFor(()=>expect(fake.scan).toHaveBeenCalledOnce())
    expect(elements['#download'].disabled).toBe(true)
    elements['#cancel'].listeners.get('click')!()
    await running
    expect(elements['#download'].disabled).toBe(true)
    fake.scan.mockRejectedValueOnce(new Error('실패'))
    await elements['#start'].listeners.get('click')!()
    expect(elements['#download'].disabled).toBe(true)
    await elements['#download'].listeners.get('click')!()
    expect(fake.download).not.toHaveBeenCalled()
  })
})
