// 응답에서 실제로 읽은 바이트만 진행률로 알리고 고정 모델의 길이를 검증한다.
export async function downloadAsset(url: string, expectedBytes: number, onBytes: (loaded: number) => void): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: 'omit' })
  if (!response.ok) throw new Error('모델 파일을 준비하지 못했습니다. 배포된 모델을 확인해 주세요.')
  onBytes(0)
  if (!response.body) {
    const bytes = await response.arrayBuffer()
    if (bytes.byteLength !== expectedBytes) throw new Error('모델 파일의 크기가 올바르지 않습니다.')
    onBytes(bytes.byteLength)
    return bytes
  }
  const reader = response.body.getReader()
  const bytes = new Uint8Array(expectedBytes)
  let loaded = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (loaded + value.byteLength > expectedBytes) throw new Error('모델 파일의 크기가 올바르지 않습니다.')
      bytes.set(value, loaded)
      loaded += value.byteLength
      onBytes(loaded)
    }
    if (loaded !== expectedBytes) throw new Error('모델 파일을 끝까지 받지 못했습니다.')
    return bytes.buffer
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally { reader.releaseLock() }
}
