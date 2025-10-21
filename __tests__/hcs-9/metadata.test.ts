import { parsePollMetadata, pollMetadataSchema } from '../../src/hcs-9';

describe('HCS-9 poll metadata schema', () => {
  const baseMetadata = {
    schema: 'hcs-9' as const,
    title: 'Community Survey',
    description: 'A poll to determine roadmap priorities.',
    author: '0.0.1001',
    votingRules: {
      schema: 'hcs-9' as const,
      allocations: [{ schema: 'hcs-9:equal-weight' as const, weight: 1 }],
      permissions: [{ schema: 'hcs-9:allow-all' as const }],
      rules: [{ name: 'allowVoteChanges' as const }],
    },
    permissionsRules: [{ schema: 'hcs-9:allow-all' as const }],
    manageRules: {
      schema: 'hcs-9' as const,
      permissions: [{ schema: 'hcs-9:allow-author' as const }],
    },
    updateRules: {
      schema: 'hcs-9' as const,
      permissions: [{ schema: 'hcs-9:allow-author' as const }],
      updateSettings: {
        endDate: true,
        description: true,
      },
    },
    options: [
      { schema: 'hcs-9' as const, id: 0, title: 'Feature A' },
      { schema: 'hcs-9' as const, id: 1, title: 'Feature B' },
    ],
    status: 'inactive' as const,
    startDate: '1720000000',
    endConditionRules: [{ schema: 'hcs-9:end-date' as const, endDate: '1720003600' }],
  };

  it('validates a complete metadata payload', () => {
    expect(() => parsePollMetadata(baseMetadata)).not.toThrow();
  });

  it('rejects metadata with duplicate option structure errors', () => {
    const invalid = {
      ...baseMetadata,
      options: [{ schema: 'hcs-9' as const, id: 0, title: '' }],
    };
    expect(() => parsePollMetadata(invalid)).toThrow();
  });

  it('requires the schema to be hcs-9', () => {
    const invalid = { ...baseMetadata, schema: 'custom' };
    expect(() => pollMetadataSchema.parse(invalid)).toThrow();
  });

  it('supports fixed weight allocations', () => {
    const metadata = {
      ...baseMetadata,
      votingRules: {
        ...baseMetadata.votingRules,
        allocations: [
          {
            schema: 'hcs-9:fixed-weight' as const,
            allocations: [
              { accountId: '0.0.2001', weight: 5 },
              { accountId: '0.0.2002', weight: 2 },
            ],
            defaultWeight: 1,
          },
        ],
      },
    };
    expect(() => parsePollMetadata(metadata)).not.toThrow();
  });
});
