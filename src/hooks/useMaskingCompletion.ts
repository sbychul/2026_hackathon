import { useState, useSyncExternalStore } from 'react'
import type { InputType } from '../api/detections'
import { createMaskingCompletion, SAVE_FAILURE_MESSAGE, type CompletionStatus } from '../masking/completion'

const messages: Record<CompletionStatus, string> = {
  ready: '가린 결과를 확인한 뒤 마스킹 완료를 눌러 주세요. 자동 탐지 건수를 한 번만 기록해요.',
  saving: '탐지 건수를 기록하고 있어요…',
  saved: '마스킹을 완료하고 탐지 건수를 기록했어요. 복사·내려받기는 추가로 기록하지 않아요.',
  skipped: '마스킹을 완료했어요. 자동 탐지가 0건이라 기록을 전송하지 않았어요.',
  failed: `${SAVE_FAILURE_MESSAGE} 가린 결과는 복사하거나 내려받을 수 있어요.`,
}

// 입력과 사용자 변경 시 다시 생성되는 결과 화면에서 한 작업의 저장 상태를 구독한다.
export function useMaskingCompletion(enterprise: boolean, inputType: InputType) {
  const [work] = useState(() => createMaskingCompletion(enterprise, inputType))
  const status = useSyncExternalStore(work.subscribe, work.getSnapshot, work.getSnapshot)
  return {
    status,
    complete: work.complete,
    message: messages[status],
    canExport: !enterprise || (status !== 'ready' && status !== 'saving'),
    buttonLabel: status === 'ready' ? '마스킹 완료' : status === 'saving' ? '기록 저장 중…' : status === 'failed' ? '완료 · 기록 확인 필요' : '마스킹 완료됨',
  }
}
