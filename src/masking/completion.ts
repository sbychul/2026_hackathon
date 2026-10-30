import { saveDetections, type InputType, type SaveDetectionsInput, type SaveDetectionsResult } from '../api/detections'
import { countByRule, type Match } from './detect'
import { RULES } from '../rules/rules'

export type CompletionStatus = 'ready' | 'saving' | 'saved' | 'skipped' | 'failed'
type Save = (input: SaveDetectionsInput) => Promise<SaveDetectionsResult>

export const SAVE_FAILURE_MESSAGE = '기록 저장 여부를 확인하지 못했어요. 중복 기록을 막기 위해 다시 전송하지 않아요.'

// 한 작업의 완료 확정을 관리한다. 화면에서는 같은 작업 동안 이 객체를 유지한다.
export function createMaskingCompletion(enterprise: boolean, inputType: InputType, save: Save = saveDetections) {
  let status: CompletionStatus = 'ready'
  let request: Promise<CompletionStatus> | undefined
  const listeners = new Set<() => void>()

  // 원문이나 오류 객체 없이 화면에 필요한 상태만 알린다.
  const publish = (next: CompletionStatus) => {
    status = next
    listeners.forEach((listener) => listener())
  }

  // 직접 가린 구간을 제외한 자동 탐지 목록만 받아 최초 확정 시 한 번 저장한다.
  const complete = (automaticMatches: readonly Match[]): Promise<CompletionStatus> => {
    if (request) return request
    if (!enterprise) {
      request = Promise.resolve('skipped')
      publish('skipped')
      return request
    }
    const totals = countByRule(automaticMatches)
    const counts: SaveDetectionsInput['counts'] = {}
    for (const { id } of RULES) {
      if (totals[id] > 0) counts[id] = totals[id]
    }
    const expectedRows = Object.keys(counts).length
    if (!expectedRows) {
      request = Promise.resolve('skipped')
      publish('skipped')
      return request
    }
    // 전송 전에 요청을 고정해 연속 클릭과 상태 알림 중의 재진입도 막는다.
    request = Promise.resolve()
      .then(() => save({ inputType, counts }))
      .then((result): CompletionStatus => result.savedRows === expectedRows ? 'saved' : 'failed')
      .catch((): CompletionStatus => 'failed')
      .then((next) => {
        publish(next)
        return next
      })
    publish('saving')
    return request
  }

  return {
    complete,
    // 화면 재렌더링 시 저장을 실행하지 않고 현재 상태만 읽는다.
    getSnapshot: () => status,
    // 화면이 사라지면 구독만 해제하고 이미 시작한 요청은 다시 보내지 않는다.
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
