import type { ParsedHcs14Did } from '../types';

const orderedParamKeys = [
  'uid',
  'registry',
  'proto',
  'nativeId',
  'domain',
  'src',
] as const;

const fqdnLabelRegex = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function uaidTargetFromParsed(parsed: ParsedHcs14Did): 'aid' | 'did' {
  return parsed.method === 'aid' ? 'aid' : 'did';
}

export function normalizeDomain(value: string): string {
  return value.trim().replace(/\.$/, '').toLowerCase();
}

export function isFqdn(value: string): boolean {
  const normalized = normalizeDomain(value);
  if (!normalized || normalized.length > 253 || !normalized.includes('.')) {
    return false;
  }
  const labels = normalized.split('.');
  for (const label of labels) {
    if (!label || label.length > 63 || !fqdnLabelRegex.test(label)) {
      return false;
    }
  }
  return true;
}

export function normalizeTxtValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  const markdownLinkMatch = trimmed.match(/^\[(.+)\]\((.+)\)$/);
  if (markdownLinkMatch) {
    return markdownLinkMatch[2].trim();
  }
  return trimmed;
}

export function parseSemicolonFields(input: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const part of input.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = normalizeTxtValue(trimmed.slice(equalsIndex + 1));
    if (!key || !value) {
      continue;
    }
    fields[key] = value;
  }
  return fields;
}

export function buildCanonicalUaid(
  target: 'aid' | 'did',
  id: string,
  params: Record<string, string>,
): string {
  const entries: string[] = [];
  const usedKeys = new Set<string>();

  for (const key of orderedParamKeys) {
    const value = params[key];
    if (value) {
      entries.push(`${key}=${value}`);
      usedKeys.add(key);
    }
  }

  const extraKeys = Object.keys(params)
    .filter(key => !usedKeys.has(key) && params[key])
    .sort((a, b) => a.localeCompare(b));

  for (const key of extraKeys) {
    entries.push(`${key}=${params[key]}`);
  }

  return entries.length > 0
    ? `uaid:${target}:${id};${entries.join(';')}`
    : `uaid:${target}:${id}`;
}

export function canonicalizeUaidFromParsed(parsed: ParsedHcs14Did): string {
  return buildCanonicalUaid(
    uaidTargetFromParsed(parsed),
    parsed.id,
    parsed.params,
  );
}
