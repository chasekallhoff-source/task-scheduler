import { createClient, SupabaseClient } from '@supabase/supabase-js';

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabaseInstance) return supabaseInstance;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  return supabaseInstance;
}

export type Task = {
  id: number;
  name: string;
  duration: number;
  category: string;
  due_date: string;
  fixed_time: string | null;
  notes: string | null;
  workspace: string;
  created_at: string;
};

// Workspace passcodes - change these to your preferred codes
export const WORKSPACES: Record<string, string> = {
  'work123': 'work',
  'personal456': 'personal',
};
