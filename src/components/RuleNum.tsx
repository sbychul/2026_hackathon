import type { RuleId } from '../rules/rules'
import { ruleNum } from './ruleDisplay'
import './RuleNum.css'

// 룰 종류를 색 대신 번호로 구분하는 작은 네모 표시. 번호는 ::before로 그려 원문 글자 수에 섞이지 않는다.
export default function RuleNum({ id }: { id: RuleId }) {
  return <span className="rule-num" data-num={ruleNum(id)} aria-hidden />
}
