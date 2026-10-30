import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { scanPdfPhones } from '../pdf/ocr'
import { hasPageImages, nativeTextLines, rotatedPageBox } from './pdf-page'
import { OPS } from 'pdfjs-dist'
import type { PDFPageProxy, TextContent } from 'pdfjs-dist/types/src/display/api'

const fake = vi.hoisted(()=>({getDocument:vi.fn(),recognize:vi.fn(),dispose:vi.fn()}))
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{}, getDocument:fake.getDocument, OPS:{paintImageXObject:85,paintInlineImageXObject:86,paintImageXObjectRepeat:88,paintInlineImageXObjectGroup:87,paintImageMaskXObject:83,paintImageMaskXObjectGroup:84,paintImageMaskXObjectRepeat:89,paintSolidColorImageMask:90}}))
vi.mock('./client',()=>({BrowserOcr:class {recognize=fake.recognize;dispose=fake.dispose}}))

const viewport = {width:600,height:900,convertToViewportPoint:(x:number,y:number)=>[x,900-y]} as ReturnType<PDFPageProxy['getViewport']>
const content = {items:[{str:'010-0000-3201',dir:'ltr',transform:[16,0,0,16,60,700],width:120,height:16,fontName:'f',hasEOL:true}],styles:{f:{ascent:.9,descent:-.2,vertical:false,fontFamily:'sans-serif'}},lang:null} satisfies TextContent

// 실제 분기 함수를 실행하되 문서 파서와 추론기만 시험 대역으로 바꾼다.
function source(pages:number,imagePages:number[]=[]) {
  const render=vi.fn(()=>({promise:Promise.resolve(),cancel:vi.fn()}))
  const cleanup=vi.fn()
  const destroy=vi.fn(async()=>{})
  const document={numPages:pages,getPage:vi.fn(async(index:number)=>({
    getViewport:()=>viewport,getOperatorList:async()=>({fnArray:imagePages.includes(index)?[85]:[31,44]}),
    getTextContent:async()=>content,render,cleanup,
  }))}
  fake.getDocument.mockReturnValue({promise:Promise.resolve(document),destroy})
  return {render,cleanup,destroy,document}
}

// 각 시험에서 이전 호출 횟수와 브라우저 대역을 초기화한다.
beforeEach(()=>{
  vi.clearAllMocks()
  fake.recognize.mockResolvedValue([{text:'010-0000-3101',confidence:.99,box:{x:60,y:100,width:200,height:40}}])
  vi.stubGlobal('createImageBitmap',vi.fn(async()=>({close:vi.fn()})))
  vi.stubGlobal('document',{createElement:()=>({width:0,height:0,getContext:()=>({fillRect:vi.fn()}),toDataURL:()=> 'data:image/png;base64,시험'})})
})
// 다른 검사에 브라우저 대역을 남기지 않는다.
afterEach(()=>vi.unstubAllGlobals())

describe('이미지 페이지에만 모델 적용',()=>{
  it('텍스트 100쪽은 모델과 페이지 렌더링을 한 번도 호출하지 않는다',async()=>{
    const document=source(100)
    const result=await scanPdfPhones(new Blob(['시험 문서']))
    expect(result).toMatchObject({count:100,ocrPages:0,directPages:100})
    expect(fake.recognize).not.toHaveBeenCalled()
    expect(document.render).not.toHaveBeenCalled()
    expect(document.cleanup).toHaveBeenCalledTimes(100)
    expect(result.pages.every(page=>!page.preview)).toBe(true)
  })
  it('텍스트 29쪽과 이미지 1쪽이면 한 쪽만 모델로 읽는다',async()=>{
    const document=source(30,[16])
    const result=await scanPdfPhones(new Blob(['시험 문서']))
    expect(result).toMatchObject({count:30,ocrPages:1,directPages:29})
    expect(fake.recognize).toHaveBeenCalledTimes(1)
    expect(document.render).toHaveBeenCalledTimes(1)
    expect(result.regions.map(region=>region.pageNumber)).toEqual(Array.from({length:30},(_,i)=>i+1))
  })
  it('이미지 페이지의 인식 실패를 건너뛴 성공 문서로 반환하지 않는다',async()=>{
    const document=source(3,[2])
    fake.recognize.mockRejectedValueOnce(new Error('시험 실패'))
    await expect(scanPdfPhones(new Blob(['시험 문서']))).rejects.toThrow('시험 실패')
    expect(document.destroy).toHaveBeenCalledOnce()
  })
  it('이미지가 많은 문서도 미리보기는 두 장만 보관한다',async()=>{
    source(5,[1,2,3,4,5])
    const result=await scanPdfPhones(new Blob(['시험 문서']))
    expect(result.pages.filter(page=>page.preview)).toHaveLength(2)
    expect(fake.recognize).toHaveBeenCalledTimes(5)
  })
  it('같은 번호가 여러 글자 조각으로 나뉘어도 직접 읽기에서 이어 붙인다',()=>{
    const items=['010-','0000-','3201'].map((str,i)=>({...content.items[0],str,width:40,transform:[16,0,0,16,60+i*40,700],hasEOL:i===2}))
    const lines=nativeTextLines({...content,items},viewport)
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('010-0000-3201')
  })
  it('작은 로고나 인라인 이미지와 이미지 마스크도 생략하지 않는다',()=>{
    for (const operation of [OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject,OPS.paintImageXObjectRepeat]) {
      expect(hasPageImages([31,operation,44],OPS)).toBe(true)
    }
    expect(hasPageImages([31,44],OPS)).toBe(false)
  })
  it('회전된 텍스트 페이지도 같은 회전이 반영된 좌표를 반환한다',()=>{
    const rotated={width:900,height:600,convertToViewportPoint:(x:number,y:number)=>[y,x]} as ReturnType<PDFPageProxy['getViewport']>
    const [line]=nativeTextLines(content,rotated)
    expect(line.box).toEqual({x:695,y:59,width:22,height:122})
  })
  it('정방향으로 인식한 가림 영역을 90도 회전한 저장 좌표로 옮긴다',()=>{
    const source={...viewport,convertToPdfPoint:(x:number,y:number)=>[x,900-y]} as typeof viewport
    const target={width:900,height:600,convertToViewportPoint:(x:number,y:number)=>[y,x]} as typeof viewport
    expect(rotatedPageBox({x:50,y:100,width:200,height:40},source,target)).toEqual({x:760,y:50,width:40,height:200})
  })
})
