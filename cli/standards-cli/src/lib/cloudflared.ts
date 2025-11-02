import {stat} from 'node:fs/promises';
import {execa} from 'execa';
import {bin as bundledCloudflaredBin} from 'cloudflared';

export const bundledCloudflaredPath = bundledCloudflaredBin;

export const fileExists = async (file: string): Promise<boolean> => {
	try {
		await stat(file);
		return true;
	} catch {
		return false;
	}
};

export const findSystemCloudflared = async (): Promise<string | null> => {
	const locator = process.platform === 'win32' ? 'where' : 'which';
	try {
		const result = await execa(locator, ['cloudflared']);
		const candidate = result.stdout.split(/\r?\n/).find(line => line.trim().length > 0);
		return candidate ? candidate.trim() : null;
	} catch {
		return null;
	}
};

export const resolveCloudflaredPath = async (): Promise<string | null> => {
	if (await fileExists(bundledCloudflaredPath)) {
		return bundledCloudflaredPath;
	}
	return findSystemCloudflared();
};
