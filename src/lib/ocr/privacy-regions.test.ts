import { describe, expect, it } from 'vitest'
import { privacyRegions } from './privacy-regions'
import type { OcrLine } from './types'

// 조각별 가림 좌표가 독립적인 시험 글자 영역을 만든다.
function line(text:string,x:number,y:number,width=180):OcrLine {
  return {text,confidence:1,box:{x,y,width,height:20}}
}

describe('기본 브랜치 공통 규칙 전체 적용',()=>{
  it('주민번호·전화·이메일·카드·이름·주소를 모두 적용한다',()=>{
    const values=['900101-1234567','010-1234-5678','person@example.com','4111-1111-1111-1111','이름: 김가온','서울특별시 강남구 테헤란로 123']
    const result=privacyRegions(values.map((text,i)=>line(text,30,30+i*40)),1,800,1000,800,1000)
    expect(result.counts).toEqual({rrn:1,phone:1,email:1,card:1,name:1,address:1})
    expect(result.count).toBe(6)
    expect(result.regions).toHaveLength(6)
  })
  it('라벨과 이름이 다른 조각이면 이름 영역만 가린다',()=>{
    const result=privacyRegions([line('이름:',20,30,40),line('김가온',100,31,60)],1,800,1000,800,1000)
    expect(result.counts).toEqual({name:1})
    expect(result.regions).toEqual([{pageNumber:1,x:96,y:27,width:68,height:28}])
  })
  it('줄바꿈으로 나뉜 주소는 양쪽 글자 영역을 모두 가린다',()=>{
    const result=privacyRegions([line('서울특별시 강남구',20,20),line('테헤란로 123',20,60)],1,800,1000,800,1000)
    expect(result.counts).toEqual({address:1})
    expect(result.regions).toHaveLength(2)
  })
  it('한 글자 영역에 여러 규칙이 맞아도 가림 사각형을 중복하지 않는다',()=>{
    const result=privacyRegions([line('이름: 김가온 / 010-1234-5678',20,20,400)],1,800,1000,800,1000)
    expect(result.count).toBe(2)
    expect(result.regions).toHaveLength(1)
  })
  it('공통 규칙의 검증과 이미 가린 값의 제외를 그대로 유지한다',()=>{
    const result=privacyRegions([line('991332-1234567',20,20),line('4111-1111-1111-1112',20,60),line('010-****-1234',20,100)],1,800,1000,800,1000)
    expect(result.count).toBe(0)
  })
})
