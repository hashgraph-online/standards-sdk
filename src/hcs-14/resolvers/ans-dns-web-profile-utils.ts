import type {
  ProfileResolutionHcs27TransparencyHints,
  ProfileResolutionHcs28TransparencyHints,
  ProfileResolutionTransparencyHints,
} from './types';
import { parseSemicolonFields } from './profile-utils';

export interface AnsDnsTxtRecord {
  version: string;
  url: string;
}

export interface AnsEndpointCandidate {
  key: string;
  endpointUrl: string;
  parsedUrl: URL;
}

export interface ParsedAnsAgentCard {
  ansName: string;
  endpoints: Record<string, unknown>;
  transparencyHints?: ProfileResolutionTransparencyHints;
}

const ANS_HCS27_REGISTRY = 'ans';

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
}

function isPrefixedSemver(value: string): boolean {
  return /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    value,
  );
}

export function parseAnsDnsTxtRecord(
  rawRecord: string,
): AnsDnsTxtRecord | null {
  const fields = parseSemicolonFields(rawRecord);
  const version = fields['v'];
  const ansVersion = fields['version'];
  const urlValue = fields['url'];
  if (
    !version ||
    !ansVersion ||
    !urlValue ||
    version.toLowerCase() !== 'ans1' ||
    !isPrefixedSemver(ansVersion)
  ) {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlValue);
  } catch {
    return null;
  }

  if (parsedUrl.protocol.toLowerCase() !== 'https:') {
    return null;
  }

  return {
    version: ansVersion,
    url: parsedUrl.toString(),
  };
}

export function isValidAnsProfileVersion(value: string | undefined): boolean {
  return !!value && isPrefixedSemver(value);
}

function hasProtocolPathSegment(pathname: string, protocol: string): boolean {
  const normalizedProtocol = protocol.trim().toLowerCase();
  if (!normalizedProtocol) {
    return false;
  }

  const pathSegments = pathname
    .split('/')
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0);
  for (const segment of pathSegments) {
    if (segment.toLowerCase() === normalizedProtocol) {
      return true;
    }
  }
  return false;
}

export function extractEndpointCandidates(
  endpoints: Record<string, unknown>,
  supportedSchemes: Set<string>,
): AnsEndpointCandidate[] {
  const candidates: AnsEndpointCandidate[] = [];
  for (const [key, value] of Object.entries(endpoints)) {
    if (!isObjectRecord(value)) {
      continue;
    }
    const endpoint = asString(value['url']);
    if (!endpoint) {
      continue;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(endpoint);
    } catch {
      continue;
    }

    const scheme = parsedUrl.protocol.replace(/:$/, '').toLowerCase();
    if (!supportedSchemes.has(scheme)) {
      continue;
    }

    candidates.push({
      key,
      endpointUrl: parsedUrl.toString(),
      parsedUrl,
    });
  }

  return candidates;
}

function validateAnsHcs27Hints(
  input: unknown,
): ProfileResolutionHcs27TransparencyHints | undefined {
  if (!isObjectRecord(input)) {
    return undefined;
  }
  const checkpointTopicId = asString(input['checkpoint_topic_id']);
  const registry = asString(input['registry']);
  const logId = asString(input['log_id']);
  if (
    !checkpointTopicId ||
    !registry ||
    !logId ||
    registry !== ANS_HCS27_REGISTRY
  ) {
    return undefined;
  }
  const checkpointUri = asString(input['checkpoint_uri']) ?? undefined;
  const viewerUri = asString(input['viewer_uri']) ?? undefined;
  return {
    checkpointTopicId,
    registry,
    logId,
    checkpointUri,
    viewerUri,
  };
}

function validateHcs28Hints(
  input: unknown,
): ProfileResolutionHcs28TransparencyHints | undefined {
  if (!isObjectRecord(input)) {
    return undefined;
  }
  const directoryTopicId = asString(input['directory_topic_id']);
  const tId = asString(input['t_id']);
  const agentId = asString(input['agent_id']);
  if (!directoryTopicId || !tId || !agentId) {
    return undefined;
  }
  const proofProfile = asString(input['proof_profile']) ?? undefined;
  return {
    directoryTopicId,
    tId,
    agentId,
    proofProfile,
  };
}

function parseTransparencyHints(
  input: unknown,
): ProfileResolutionTransparencyHints | undefined {
  if (!isObjectRecord(input)) {
    return undefined;
  }
  const hcs27 = validateAnsHcs27Hints(input['hcs27']);
  const hcs28 = validateHcs28Hints(input['hcs28']);
  if (!hcs27 && !hcs28) {
    return undefined;
  }
  return {
    hcs27,
    hcs28,
  };
}

export function parseAnsAgentCard(input: unknown): ParsedAnsAgentCard | null {
  if (!isObjectRecord(input)) {
    return null;
  }
  const ansName = asString(input['ansName']);
  const endpoints = input['endpoints'];
  if (!ansName || !isObjectRecord(endpoints)) {
    return null;
  }
  return {
    ansName,
    endpoints,
    transparencyHints: parseTransparencyHints(input['transparency']),
  };
}

export function selectPreferredEndpoint(
  candidates: AnsEndpointCandidate[],
  protocol: string,
): AnsEndpointCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const sortedCandidates = [...candidates].sort((a, b) =>
    a.key.localeCompare(b.key),
  );
  const protocolMatches = sortedCandidates.filter(candidate =>
    hasProtocolPathSegment(candidate.parsedUrl.pathname, protocol),
  );
  if (protocolMatches.length > 0) {
    return protocolMatches[0];
  }
  return sortedCandidates[0];
}

export function toErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return null;
}
