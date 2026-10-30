import { setCustomWords } from '../rules/rules'

export interface CustomWord {
  id: string
  word: string
}

// 등록된 기업 공통 가림 단어를 오래된 순서로 조회한다.
export async function listCustomWords(): Promise<CustomWord[]> {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.from('custom_words').select('id, word').order('created_at')
  if (error) throw error
  return data ?? []
}

// 앞뒤 공백을 지운 단어를 검사한 뒤 관리자 권한으로 추가한다.
export async function addCustomWord(word: string, existing: readonly CustomWord[]): Promise<CustomWord> {
  const value = word.trim()
  if (!value) throw new Error('공백만 입력할 수 없어요.')
  if (value.length > 100) throw new Error('100자 이하로 입력해 주세요.')
  if (existing.some((item) => item.word.toLowerCase() === value.toLowerCase())) throw new Error('이미 등록된 단어예요.')
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.from('custom_words').insert({ word: value }).select('id, word').single()
  if (error) throw new Error(error.code === '23505' ? '이미 등록된 단어예요.' : '단어를 저장하지 못했어요.')
  return data
}

// 관리자 권한으로 공통 단어를 삭제한다. 권한이 없어 지워지지 않으면 실패로 본다.
export async function deleteCustomWord(id: string): Promise<void> {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.from('custom_words').delete().eq('id', id).select('id')
  if (error || !data?.length) throw new Error('단어를 삭제하지 못했어요.')
}

// 기업 모드는 최신 공통 단어를 탐지 룰에 넣고, 개인 모드는 비운다.
export async function applyCustomWords(company: boolean): Promise<void> {
  if (!company) return setCustomWords([])
  setCustomWords((await listCustomWords()).map((item) => item.word))
}
