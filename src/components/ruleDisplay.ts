import { RULES, type RuleId } from '../rules/rules'

// 시안에서 룰을 보여주는 순서. 번호는 이 순서의 1부터 매긴다. 계좌번호와 공통 단어는 시안 이후 추가돼 맨 뒤에 둔다.
export const RULE_ORDER: RuleId[] = ['name', 'rrn', 'phone', 'email', 'card', 'address', 'account', 'custom']

// 룰 id로 화면에 보일 번호와 이름을 구한다.
export const ruleNum = (id: RuleId) => RULE_ORDER.indexOf(id) + 1
export const ruleName = (id: RuleId) => RULES.find((r) => r.id === id)!.name
