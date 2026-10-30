import './Spinner.css'

// 결과를 준비하는 동안 테두리가 도는 원을 화면 가운데에 보여준다.
export default function Spinner() {
  return (
    <div className="spinner-wrap" role="status">
      <span className="spinner" aria-hidden />
      <span className="visually-hidden">개인정보를 찾는 중이에요</span>
    </div>
  )
}
