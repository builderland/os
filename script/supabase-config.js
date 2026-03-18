// Supabase 클라이언트 초기화를 위한 설정 파일

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://zzczkrnninvyyxwdicck.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6Y3prcm5uaW52eXl4d2RpY2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNzQxMTEsImV4cCI6MjA4NzY1MDExMX0.mgzgnSoSGIOKi2tJe-C_BNfdroH7rZs6fsm8c4KV0Pg'; // TODO: 실제 Supabase anon 공개 키로 변경

// Supabase 클라이언트 인스턴스를 생성하여 다른 모듈에서 사용할 수 있도록 export
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

