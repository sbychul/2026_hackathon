import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadAsset } from './download'

// 각 시험의 가짜 전송 함수를 다음 시험에 남기지 않는다.
afterEach(()=>vi.unstubAllGlobals())

describe('실제 수신 바이트로 모델 다운로드 표시',()=>{
  it('조각별 수신량을 보고하며 압축 응답 길이를 모델 크기로 오인하지 않는다',async()=>{
    const body=new ReadableStream<Uint8Array>({start(controller){
      controller.enqueue(new Uint8Array([1,2,3]));controller.enqueue(new Uint8Array([4,5]));controller.close()
    }})
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(body,{headers:{'Content-Length':'2'}})))
    const counts:number[]=[]
    const bytes=await downloadAsset('/model',5,value=>counts.push(value))
    expect([...new Uint8Array(bytes)]).toEqual([1,2,3,4,5])
    expect(counts).toEqual([0,3,5])
  })
  it('중간에 끊긴 모델을 완료로 보고하지 않는다',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1,2,3]))))
    const counts:number[]=[]
    await expect(downloadAsset('/model',5,value=>counts.push(value))).rejects.toThrow('끝까지')
    expect(counts.at(-1)).toBe(3)
  })
  it('잘못된 크기나 서버 오류를 정상 모델로 반환하지 않는다',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(new Uint8Array([1,2,3]))))
    await expect(downloadAsset('/model',2,()=>{})).rejects.toThrow('크기')
    vi.stubGlobal('fetch',vi.fn(async()=>new Response('오류',{status:404})))
    const progress=vi.fn()
    await expect(downloadAsset('/model',2,progress)).rejects.toThrow('준비하지')
    expect(progress).not.toHaveBeenCalled()
  })
})
