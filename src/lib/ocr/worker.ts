import { loadEngine, recognizePage } from './engine'
import type { WorkerReply } from './types'

const scope = self as unknown as { onmessage: (event: MessageEvent<ImageBitmap>) => void; postMessage: (reply: WorkerReply) => void }
let engine: ReturnType<typeof loadEngine> | undefined
// 인식 처리는 별도 작업자에서 수행하고 원문은 외부 요청이나 로그로 보내지 않는다.
scope.onmessage = async ({ data: image }) => {
  try {
    if (!engine) {
      scope.postMessage({ kind: 'progress', progress: { stage: 'models', completed: 0, total: 1 } })
      engine = loadEngine()
    }
    const lines = await recognizePage(image, await engine, progress => scope.postMessage({ kind: 'progress', progress }))
    scope.postMessage({ kind: 'result', lines })
  } catch {
    scope.postMessage({ kind: 'error', message: '글자 인식에 실패했습니다. 모델 준비 상태와 문서 품질을 확인해 주세요. 개인정보가 없다는 뜻은 아닙니다.' })
  } finally { image.close() }
}
