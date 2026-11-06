import {createClient} from '@supabase/supabase-js';
export const supabaseUrl=import.meta.env.PUBLIC_SUPABASE_URL||'https://hrwlrzbjusplfxwkrend.supabase.co';
export const supabasePublishableKey=import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_2XSc3Hs4UDdYg3nY4GMtKQ_9zpB6ICi';
export const supabase=createClient(
 supabaseUrl,
 supabasePublishableKey,
 {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}}
);
