import { describe, expect, it } from 'vitest'
import { privacyRegions } from './privacy-regions'
import type { OcrLine } from './types'

// 조각별 가림 좌표가 독립적인 시험 글자 영역을 만든다.
function line(text:string,x:number,y:number,width=180):OcrLine {
  return {text,confidence:1,box:{x,y,width,height:20}}
}

describe('기본 브랜치 공통 규칙 전체 적용',()=>{
  it.each([
    ['010-12','34-5678'],
    ['010-1','23','4-5678'],
    ['01012','345678'],
  ])('숫자 중간에서 잘린 인접 조각을 한 번호로 탐지한다: %j',(...parts)=>{
    const result=privacyRegions(parts.map((text,i)=>line(text,20+i*60,20,60)),1,800,1000,800,1000)
    expect(result.counts).toEqual({phone:1})
    expect(result.regions).toHaveLength(parts.length)
    expect(result.regions.map(region=>region.x)).toEqual(parts.map((_,i)=>16+i*60))
  })
  it('서로 먼 표 열의 숫자는 공백 구분 전화번호로 탐지하지 않는다',()=>{
    const result=privacyRegions([line('010',20,20,30),line('1234',300,20,40),line('5678',650,20,40)],1,1000,1000,1000,1000)
    expect(result.count).toBe(0)
    expect(result.regions).toEqual([])
  })
  it('가까운 공백 구분 전화번호는 두 탐지 경로에서 한 번만 센다',()=>{
    const result=privacyRegions(['010','1234','5678'].map((text,i)=>line(text,20+i*62,20,60)),1,800,1000,800,1000)
    expect(result.counts).toEqual({phone:1})
    expect(result.regions).toHaveLength(3)
  })
  it('한 조각 안의 기존 번호와 다음 조각까지 이어지는 번호를 각각 가린다',()=>{
    const result=privacyRegions([line('010-9876-5432 / 010-12',20,20,240),line('34-5678',260,20,80)],1,800,1000,800,1000)
    expect(result.counts).toEqual({phone:2})
    expect(result.regions).toHaveLength(2)
  })
  it('숫자 결합이 공백 구분 카드번호와 최신 공통 계좌번호 탐지를 없애지 않는다',()=>{
    const parts=['4111','1111','1111','1111'].map((text,i)=>line(text,20+i*62,20,60))
    parts.push(line('계좌번호: 123-456789-012',20,60,300))
    const result=privacyRegions(parts,1,800,1000,800,1000)
    expect(result.counts).toEqual({card:1,account:1})
    expect(result.regions).toHaveLength(5)
  })
  it.each([['010-','1234-','5678'],['010','-1234','-5678'],['010- ','1234- ','5678']])('가까운 번호 조각의 구분자를 이어 탐지하고 모든 원래 영역을 가린다: %j',(...parts)=>{
    const result=privacyRegions(parts.map((text,i)=>line(text,20+i*62,20,60)),1,800,1000,800,1000)
    expect(result.counts).toEqual({phone:1})
    expect(result.regions).toHaveLength(3)
    expect(result.regions.map(region=>region.x)).toEqual([16,78,140])
  })
  it('다른 열이나 다른 줄의 숫자를 한 전화번호로 합치지 않는다',()=>{
    for (const parts of [
      [line('010-',20,20,40),line('1234-',240,20,50),line('5678',500,20,50)],
      [line('010-',20,20,40),line('1234-',20,60,50),line('5678',20,100,50)],
    ]) expect(privacyRegions(parts,1,800,1000,800,1000).count).toBe(0)
  })
  it('같은 줄의 완성된 두 전화번호를 각각 유지한다',()=>{
    expect(privacyRegions([line('010-1234-5678',20,20),line('010-9876-5432',202,20)],1,800,1000,800,1000).counts).toEqual({phone:2})
  })
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
