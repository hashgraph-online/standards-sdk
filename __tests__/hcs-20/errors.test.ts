import {
  HCS20Error,
  PointsDeploymentError,
  PointsMintError,
  PointsTransferError,
  PointsBurnError,
  PointsValidationError,
  PointsNotFoundError,
  TopicRegistrationError,
  InsufficientBalanceError,
  SupplyLimitExceededError,
  MintLimitExceededError,
  InvalidMessageFormatError,
  InvalidAccountFormatError,
  InvalidTickFormatError,
  InvalidNumberFormatError,
} from '../../src/hcs-20/errors';

describe('HCS-20 Error classes', () => {
  test('base HCS20Error', () => {
    const e = new HCS20Error('oops');
    expect(e.name).toBe('HCS20Error');
    expect(e.message).toBe('oops');
  });

  test('PointsDeploymentError captures tick', () => {
    const e = new PointsDeploymentError('deploy failed', 'test');
    expect(e.name).toBe('PointsDeploymentError');
    expect(e.tick).toBe('test');
  });

  test('PointsMintError captures fields', () => {
    const e = new PointsMintError('mint failed', 'tick', '100', '50');
    expect(e.name).toBe('PointsMintError');
    expect(e.tick).toBe('tick');
    expect(e.requestedAmount).toBe('100');
    expect(e.availableSupply).toBe('50');
  });

  test('PointsTransferError captures fields', () => {
    const e = new PointsTransferError('x', 'tick', 'a', 'b', '10', '5');
    expect(e.name).toBe('PointsTransferError');
    expect(e.from).toBe('a');
    expect(e.to).toBe('b');
  });

  test('PointsBurnError captures fields', () => {
    const e = new PointsBurnError('x', 'tick', 'a', '10', '5');
    expect(e.name).toBe('PointsBurnError');
    expect(e.from).toBe('a');
  });

  test('PointsValidationError captures array', () => {
    const e = new PointsValidationError('invalid', ['a', 'b']);
    expect(e.validationErrors).toEqual(['a', 'b']);
  });

  test('PointsNotFoundError builds message', () => {
    const e = new PointsNotFoundError('tickx');
    expect(e.message).toMatch(/tickx/);
  });

  test('TopicRegistrationError captures topic', () => {
    const e = new TopicRegistrationError('bad', '0.0.123');
    expect(e.topicId).toBe('0.0.123');
  });

  test('InsufficientBalanceError formats message', () => {
    const e = new InsufficientBalanceError('0.0.1', 't', '10', '3');
    expect(e.message).toMatch(/Insufficient balance/);
    expect(e.accountId).toBe('0.0.1');
  });

  test('SupplyLimitExceededError formats message', () => {
    const e = new SupplyLimitExceededError('t', '100', '1000', '950');
    expect(e.message).toMatch(/Supply limit exceeded/);
  });

  test('MintLimitExceededError formats message', () => {
    const e = new MintLimitExceededError('t', '200', '50');
    expect(e.message).toMatch(/Mint limit exceeded/);
  });

  test('InvalidMessageFormatError captures data', () => {
    const e = new InvalidMessageFormatError('bad', { a: 1 });
    expect(e.messageData).toEqual({ a: 1 });
  });

  test('InvalidAccountFormatError builds message', () => {
    const e = new InvalidAccountFormatError('nope');
    expect(e.message).toMatch(/nope/);
  });

  test('InvalidTickFormatError builds message', () => {
    const e = new InvalidTickFormatError('TICK');
    expect(e.message).toMatch(/TICK/);
  });

  test('InvalidNumberFormatError builds message', () => {
    const e = new InvalidNumberFormatError('abc', 'amount');
    expect(e.message).toMatch(/amount/);
  });
});
