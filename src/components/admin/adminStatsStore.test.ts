import { describe, expect, it, vi } from 'vitest'
import { getMockAdminStats } from '../../api/stats'
import type { CurrentUser } from '../../api/auth'
import { createAdminStatsStore } from './adminStatsStore'

const admin: CurrentUser = { id: 'admin', email: null, name: '가상 관리자', role: 'admin' }

// 응답 순서를 직접 제어해 중복 요청과 오래된 응답을 검사한다.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('관리자 통계 화면 상태', () => {
  it.each([null, { ...admin, role: 'employee' as const }])('관리자가 아니면 통계 API를 호출하지 않는다', async (user) => {
    const stats = vi.fn(getMockAdminStats)
    const store = createAdminStatsStore({ currentUser: async () => user, stats })
    await store.reload()
    expect(store.getSnapshot()).toEqual({ status: 'denied', stats: null })
    expect(stats).not.toHaveBeenCalled()
  })

  it('권한 조회 실패를 통계 0건이나 가짜 데이터로 바꾸지 않는다', async () => {
    const stats = vi.fn(getMockAdminStats)
    const store = createAdminStatsStore({ currentUser: async () => { throw new Error('비공개 오류') }, stats })
    await store.reload()
    expect(store.getSnapshot()).toEqual({ status: 'error', stats: null })
    expect(stats).not.toHaveBeenCalled()
  })

  it('통계 조회 실패 후 재조회할 수 있고 이전 통계를 노출하지 않는다', async () => {
    const stats = vi.fn(getMockAdminStats)
    const store = createAdminStatsStore({ currentUser: async () => admin, stats })
    await store.reload()
    expect(store.getSnapshot().status).toBe('ready')
    stats.mockRejectedValueOnce(new Error('비공개 오류'))
    await store.reload()
    expect(store.getSnapshot()).toEqual({ status: 'error', stats: null })
    await store.reload()
    expect(store.getSnapshot().status).toBe('ready')
  })

  it('조회 중 연속 클릭은 한 번만 처리한다', async () => {
    const pending = deferred<CurrentUser | null>()
    const currentUser = vi.fn(() => pending.promise)
    const stats = vi.fn(getMockAdminStats)
    const store = createAdminStatsStore({ currentUser, stats })
    const first = store.reload()
    await store.reload()
    expect(currentUser).toHaveBeenCalledTimes(1)
    pending.resolve(admin)
    await first
    expect(stats).toHaveBeenCalledTimes(1)
  })

  it('로그아웃 후 늦게 도착한 관리자 통계를 버린다', async () => {
    const pending = deferred<Awaited<ReturnType<typeof getMockAdminStats>>>()
    const currentUser = vi.fn<() => Promise<CurrentUser | null>>().mockResolvedValue(admin)
    const store = createAdminStatsStore({ currentUser, stats: () => pending.promise })
    const first = store.reload()
    await Promise.resolve()
    store.clear()
    currentUser.mockResolvedValue(null)
    await store.reload()
    pending.resolve(await getMockAdminStats())
    await first
    expect(store.getSnapshot()).toEqual({ status: 'denied', stats: null })
  })

  it('새 기록 조회 시 순위·교차표·합계를 하나의 응답으로 교체한다', async () => {
    const before = await getMockAdminStats()
    const after = structuredClone(before)
    after.ranking[0].total++
    after.userRuleCounts[0].total++
    after.userRuleCounts[0].counts.rrn++
    after.ruleTotals[0].count++
    const stats = vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after)
    const store = createAdminStatsStore({ currentUser: async () => admin, stats })
    await store.reload()
    expect(store.getSnapshot()).toEqual({ status: 'ready', stats: before })
    await store.reload()
    expect(store.getSnapshot()).toEqual({ status: 'ready', stats: after })
  })

  it('뒤에서 하는 재조회는 응답 전까지 표시 중인 통계를 유지한다', async () => {
    const stats = await getMockAdminStats()
    const store = createAdminStatsStore({ currentUser: async () => admin, stats: async () => stats })
    await store.reload()
    const again = store.reload(true)
    expect(store.getSnapshot()).toEqual({ status: 'ready', stats })
    await again
    expect(store.getSnapshot()).toEqual({ status: 'ready', stats })
  })
})
