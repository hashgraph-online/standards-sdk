import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pkgPath = path.resolve(__dirname, '../package.json');
const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'));

function getBaseVersion(version) {
  if (typeof version !== 'string') {
    throw new TypeError('package.json version must be a string');
  }

  const match = version.trim().match(/^(\d+\.\d+\.\d+)(?:[-+].*)?$/);
  if (!match) {
    throw new Error(`Unsupported package version format: ${version}`);
  }
  return match[1];
}

function sanitizeBranchName(branchName) {
  const sanitized = branchName
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

  return sanitized || 'branch';
}

const branchInput = process.argv[2] ?? process.env.GITHUB_REF_NAME;
if (!branchInput) {
  throw new Error('Branch name is required either as an argument or via GITHUB_REF_NAME');
}

const runNumber = process.argv[3] ?? process.env.GITHUB_RUN_NUMBER ?? '0';
const runAttempt = process.argv[4] ?? process.env.GITHUB_RUN_ATTEMPT ?? '1';
const shortSha = (process.env.GITHUB_SHA ?? 'localsha').slice(0, 7);

const baseVersion = getBaseVersion(pkgJson.version);
const branchId = sanitizeBranchName(branchInput);

const prereleaseSegments = [branchId, 'canary', shortSha, String(runNumber).padStart(3, '0')];
if (Number(runAttempt) > 1) {
  prereleaseSegments.push(String(runAttempt));
}

const canaryVersion = `${baseVersion}-${prereleaseSegments.join('.')}`;
const npmTag = `canary-${branchId}`.slice(0, 128);

const outputs = {
  version: canaryVersion,
  tag: npmTag,
  baseVersion,
  branch: branchId,
};

if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${canaryVersion}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `tag=${npmTag}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `baseVersion=${baseVersion}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `branch=${branchId}\n`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    `### Canary release details`,
    '',
    `- Base version: ${baseVersion}`,
    `- Branch: ${branchId}`,
    `- Canary version: ${canaryVersion}`,
    `- npm dist-tag: ${npmTag}`,
    '',
  ].join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

process.stdout.write(`${JSON.stringify(outputs)}\n`);
