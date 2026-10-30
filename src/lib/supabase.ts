import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('.env에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY를 설정해야 한다. (.env.example 참고)')
}

// 앱 전체에서 공유하는 Supabase 클라이언트. 공개용(anon) 키만 사용한다.
export const supabase = createClient(url, anonKey)
