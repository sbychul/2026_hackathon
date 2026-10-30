import { useState, type FormEvent } from 'react'
import Button from '../Button'
import { createManualRegion, type ManualRegion, type PageSize } from '../../lib/pdf/manualRegions'

// 드래그 대신 기본 회전 기준 좌표를 입력해 직접 영역을 추가한다.
export default function RegionCoordinates({ pages, onAdd, disabled }: { pages: PageSize[]; onAdd: (region: ManualRegion) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')

  // 잘못된 쪽과 페이지 바깥 좌표를 거부하고 유효한 사각형만 추가한다.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (disabled) return
    const values = new FormData(event.currentTarget)
    const [pageNumber, x, y, width, height] = ['page', 'x', 'y', 'width', 'height'].map((key) => Number(values.get(key)))
    const page = pages[pageNumber - 1]
    if (!Number.isInteger(pageNumber) || !page || ![x, y, width, height].every(Number.isFinite)
      || x < 0 || y < 0 || width < 1 || height < 1 || x + width > page.width || y + height > page.height) {
      setError('쪽 번호와 좌표를 확인해 주세요. 영역은 페이지 안에 있어야 해요.')
      return
    }
    const region = createManualRegion({ x, y }, { x: x + width, y: y + height }, page, pageNumber, crypto.randomUUID())
    if (region) { onAdd(region); setError('') }
  }

  return <div className="pdf-coordinate-panel">
    <Button variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>좌표로 추가</Button>
    {open && <form onSubmit={submit}>
      <p>기본 방향·배율 1의 왼쪽 위 기준이에요. 화면 확대와 추가 회전은 좌표에 영향을 주지 않아요.</p>
      <p>{pages.map((page, index) => `${index + 1}쪽: ${Math.round(page.width)} × ${Math.round(page.height)}`).join(' / ')}</p>
      {(['page', 'x', 'y', 'width', 'height'] as const).map((name, index) => <label key={name}>
        {['쪽', '왼쪽', '위쪽', '너비', '높이'][index]}
        <input name={name} type="number" min={name === 'page' || name === 'width' || name === 'height' ? 1 : 0}
          step={name === 'page' ? 1 : 'any'} defaultValue={name === 'page' ? 1 : name === 'width' || name === 'height' ? 20 : 0} required />
      </label>)}
      <Button type="submit" disabled={disabled}>이 영역 추가</Button>
      {error && <p role="alert">{error}</p>}
    </form>}
  </div>
}
