import type {
  Hcs25AdapterDefinition,
  Hcs25NormalizedValue,
  Hcs25Subject,
} from '../../src/hcs-25/types';

export const subject: Hcs25Subject = { id: 'agent:example' };

export function ok(value: number): Hcs25NormalizedValue {
  return { value, status: 'ok' };
}

export function missing(): Hcs25NormalizedValue {
  return { value: 0, status: 'missing' };
}

export function singleComponentAdapter(
  id: string,
  options: {
    weight?: number;
    contributionMode?: Hcs25AdapterDefinition['contributionMode'];
    nonScorableWhenUnavailable?: boolean;
    defaultComponentKey?: string;
    producesOutput?: boolean;
  } = {},
): Hcs25AdapterDefinition {
  const producesOutput = options.producesOutput ?? true;
  return {
    id,
    weight: options.weight,
    contributionMode: options.contributionMode,
    defaultComponentKey: options.defaultComponentKey,
    components: [
      {
        name: 'score',
        nonScorableWhenUnavailable: options.nonScorableWhenUnavailable,
        normalize: () => (producesOutput ? ok(80) : missing()),
      },
    ],
  };
}
