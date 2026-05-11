import { randomUUID } from 'node:crypto';

export const nowIso = () => new Date().toISOString();

export const createId = (prefix = 'id') => `${prefix}_${randomUUID()}`;

export function extractJsonObject(text) {
  if (!text || typeof text !== 'string') return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || end <= start) return null;

  const sliced = candidate.slice(start, end + 1);
  try {
    return JSON.parse(sliced);
  } catch {
    return null;
  }
}

export function extractJsonArray(text) {
  if (!text || typeof text !== 'string') return null;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;

  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');

  if (start === -1 || end === -1 || end <= start) return null;

  const sliced = candidate.slice(start, end + 1);
  try {
    return JSON.parse(sliced);
  } catch {
    return null;
  }
}

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function normalizeText(text) {
  return String(text || '').trim();
}
