import { TransactionParser } from '../../src/utils/transaction-parser';

describe('TransactionParser - Token Creation Bug Fix', () => {
  const tokenCreateTransactionBytes =
    'Ck0aACJJIgIIeDIA6gFACgVTVVBQTBIFU1VQUEYYAiCgjQYqCQgAEAAYxKiiAWoICKXLt8gGEAB6BQiAztoDiAEAkAEBmAGAgJqm6q/jAQ==';

  const failingTokenCreateBytes =
    'Ck4aACJKIgIIeDIA6gFBCgZTVVBQTFkSBVNVUFBMGAIgoI0GKgkIABAAGMSoogFqCAjU0rfIBhAAegUIgM7aA4gBAJABAZgBgICapuqv4wE=';

  test('should correctly parse TokenCreateTransaction bytes as TOKENCREATE', async () => {
    const result = await TransactionParser.parseTransactionBytes(
      tokenCreateTransactionBytes,
    );

    expect(result.type).toBe('TOKENCREATE');
    expect(result.humanReadableType).toBe('Token Creation');
    expect(result.tokenCreation).toBeDefined();
    expect(result.tokenCreation?.tokenName).toBe('SUPPL');
    expect(result.tokenCreation?.tokenSymbol).toBe('SUPPF');
    expect(result.tokenCreation?.initialSupply).toBe('100000');
    expect(result.tokenCreation?.decimals).toBe(2);
    expect(result.tokenCreation?.treasuryAccountId).toBe('0.0.2659396');
    expect(result.tokenCreation?.tokenType).toBe('FUNGIBLE_COMMON');
    expect(result.tokenCreation?.supplyType).toBe('FINITE');
  });

  test('should not return UNKNOWN for valid token creation transaction', async () => {
    const result = await TransactionParser.parseTransactionBytes(
      tokenCreateTransactionBytes,
    );

    expect(result.type).not.toBe('UNKNOWN');
    expect(result.humanReadableType).not.toBe('Unknown Transaction');
  });

  test('should extract token creation data even when HTS parser fails to detect it in transaction body', async () => {
    const result = await TransactionParser.parseTransactionBytes(
      tokenCreateTransactionBytes,
    );

    expect(result.tokenCreation).toBeDefined();
    expect(result.tokenCreation?.tokenName).toBeTruthy();
    expect(result.tokenCreation?.tokenSymbol).toBeTruthy();
  });

  test('should include format detection metadata', async () => {
    const result = await TransactionParser.parseTransactionBytes(
      tokenCreateTransactionBytes,
    );

    expect(result.formatDetection).toBeDefined();
    expect(result.formatDetection?.originalFormat).toBe('base64');
    expect(result.formatDetection?.wasConverted).toBe(false);
    expect(result.formatDetection?.length).toBe(
      tokenCreateTransactionBytes.length,
    );
  });

  test('should correctly parse the failing transaction bytes as TOKENCREATE', async () => {
    const result = await TransactionParser.parseTransactionBytes(
      failingTokenCreateBytes,
    );

    expect(result.type).toBe('TOKENCREATE');
    expect(result.humanReadableType).toBe('Token Creation');
    expect(result.type).not.toBe('UNKNOWN');

    expect(result.tokenCreation).toBeDefined();
    expect(result.tokenCreation?.tokenName).toBe('SUPPLY');
    expect(result.tokenCreation?.tokenSymbol).toBe('SUPPL');
    expect(result.tokenCreation?.decimals).toBe(2);
    expect(result.tokenCreation?.initialSupply).toBeTruthy();
    expect(result.tokenCreation?.tokenType).toBeTruthy();
    expect(result.tokenCreation?.supplyType).toBeTruthy();
  });

  test('should prioritize constructor name detection over HTS parser results', async () => {
    const result = await TransactionParser.parseTransactionBytes(
      failingTokenCreateBytes,
    );

    expect(result.type).toBe('TOKENCREATE');
    expect(result.humanReadableType).toBe('Token Creation');
    expect(result.tokenCreation).toBeDefined();
  });
});
