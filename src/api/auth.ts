import { isAuthApiError, isAuthSessionMissingError } from '@supabase/supabase-js'

export type UserRole = 'employee' | 'admin'

export interface CurrentUser {
  id: string
  email: string | null
  name: string
  role: UserRole
}

export interface LoginInput {
  email: string
  password: string
}

// 로그인 상태를 서버에서 확인하고 프로필에 저장된 이름과 역할을 반환한다.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const { supabase } = await import('../lib/supabase')
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    if (isAuthSessionMissingError(error)) return null
    // 삭제된 사용자나 무효 토큰은 남은 로컬 세션을 지워 로그인 화면으로 돌아갈 수 있게 한다.
    if (isAuthApiError(error) && (error.status === 401 || error.status === 403)) {
      await supabase.auth.signOut({ scope: 'local' })
      return null
    }
    throw error
  }
  if (!data.user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, name, role')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile || (profile.role !== 'employee' && profile.role !== 'admin')) {
    throw new Error('사용자 프로필이나 역할을 확인할 수 없습니다.')
  }
  return {
    id: data.user.id,
    email: data.user.email ?? null,
    name: profile.name,
    role: profile.role,
  }
}

// 이메일과 비밀번호로 로그인하고 현재 사용자와 역할을 반환한다.
export async function login(input: LoginInput): Promise<CurrentUser> {
  const { supabase } = await import('../lib/supabase')
  const { error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })
  if (error) throw error
  try {
    const user = await getCurrentUser()
    if (!user) throw new Error('로그인한 사용자를 확인할 수 없습니다.')
    return user
  } catch (userError) {
    // 프로필 확인에 실패하면 로그인 실패로 보이므로 방금 만든 세션도 지운다.
    await supabase.auth.signOut({ scope: 'local' })
    throw userError
  }
}

// 현재 브라우저의 로그인 세션을 종료한다.
export async function logout(): Promise<void> {
  const { supabase } = await import('../lib/supabase')
  const { error } = await supabase.auth.signOut({ scope: 'local' })
  if (error) throw error
}
