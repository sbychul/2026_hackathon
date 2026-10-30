import './EnterpriseNotice.css'

// 기업 입력·결과·오류 화면에 같은 정보 처리 안내를 표시한다.
export default function EnterpriseNotice() {
  return (
    <aside className="enterprise-notice" aria-label="기업 개인정보 처리 안내">
      내용은 저장되지 않고 건수만 기록돼요. 관리자가 고정한 자동 탐지 항목은 직원과 관리자 모두 반드시 가려져요.
    </aside>
  )
}
