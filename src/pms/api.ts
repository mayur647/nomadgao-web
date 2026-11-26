import type { PmsApi } from './types';
import { demoApi } from './demo';
import { liveApi } from './live';

const live = !!import.meta.env.PUBLIC_SUPABASE_URL && !!import.meta.env.PUBLIC_SUPABASE_ANON_KEY;
export const api: PmsApi = live ? liveApi : demoApi;
export const isDemo = !live;
export * from './types';
export * from './dates';
