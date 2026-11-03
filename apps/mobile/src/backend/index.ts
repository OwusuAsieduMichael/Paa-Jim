import { DEMO } from '@/lib/config';
import { demoBackend } from './demoBackend';
import { supabaseBackend } from './supabaseBackend';

export const backend = DEMO ? demoBackend : supabaseBackend;
export * from './types';
