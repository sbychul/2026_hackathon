import type { OcrLine, OcrProgress, WorkerReply } from './types'

// 페이지를 순서대로 처리하며 취소와 시간 초과 때 작업자 메모리를 해제한다.
export class BrowserOcr {
  private worker: Worker | null = null
  private active = false

  // 전달된 이미지의 소유권을 작업자로 옮겨 한 페이지를 인식한다.
  recognize(image: ImageBitmap, signal?: AbortSignal, onProgress?: (progress: OcrProgress) => void): Promise<OcrLine[]> {
    if (this.active || signal?.aborted) { image.close(); return Promise.reject(new Error('글자 인식이 취소되었거나 이미 진행 중입니다.')) }
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.active = true
    const worker = this.worker
    return new Promise((resolve, reject) => {
      // 작업 완료 후 일회성 감시자와 이벤트 연결을 정리한다.
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); worker.onmessage = null; worker.onerror = null; this.active = false }
      // 취소나 오류가 나면 추론을 중단하고 재실행 가능한 상태로 만든다.
      const fail = (message: string) => { cleanup(); this.dispose(); reject(new Error(message)) }
      const abort = () => fail('작업을 취소했습니다.')
      const timer = setTimeout(() => fail('한 쪽의 처리 시간이 3분을 넘었습니다. 문서를 나누어 다시 시도해 주세요.'), 180_000)
      signal?.addEventListener('abort', abort, { once: true })
      worker.onerror = () => fail('브라우저 글자 인식기를 시작하지 못했습니다.')
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        if (data.kind === 'progress') onProgress?.(data.progress)
        else if (data.kind === 'error') fail(data.message)
        else { cleanup(); resolve(data.lines) }
      }
      worker.postMessage(image, [image])
    })
  }

  // 문서 처리가 끝나면 모델과 작업자 메모리를 버린다.
  dispose(): void { this.worker?.terminate(); this.worker = null }
}
