import {createClient} from '@supabase/supabase-js';
export const supabase=createClient(
 import.meta.env.PUBLIC_SUPABASE_URL||'https://hrwlrzbjusplfxwkrend.supabase.co',
 import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_2XSc3Hs4UDdYg3nY4GMtKQ_9zpB6ICi',
 {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}}
);
