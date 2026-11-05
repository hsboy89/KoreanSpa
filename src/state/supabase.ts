import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const CONNECT_TIMEOUT_MS = 5000;

let client: SupabaseClient | null | undefined;

/** 환경변수가 없으면 null. 익명 로그인 세션을 유지하도록 클라이언트는 하나만 만든다. */
export function getSupabase(): SupabaseClient | null {
  if (client === undefined) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
    client = url && key ? createClient(url, key) : null;
  }
  return client;
}
