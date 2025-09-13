import {
  PayloadSizeError,
  AccountCreationError,
  TopicCreationError,
  ConnectionConfirmationError,
} from '../../src/hcs-10/errors';

describe('HCS-10 Error classes', () => {
  test('PayloadSizeError captures name and payload size', () => {
    const err = new PayloadSizeError('too big', 4096);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PayloadSizeError');
    expect(err.message).toBe('too big');
    expect(err.payloadSize).toBe(4096);
  });

  test('AccountCreationError has correct name', () => {
    const err = new AccountCreationError('failed');
    expect(err.name).toBe('AccountCreationError');
    expect(err.message).toBe('failed');
  });

  test('TopicCreationError has correct name', () => {
    const err = new TopicCreationError('boom');
    expect(err.name).toBe('TopicCreationError');
  });

  test('ConnectionConfirmationError has correct name', () => {
    const err = new ConnectionConfirmationError('timeout');
    expect(err.name).toBe('ConnectionConfirmationError');
    expect(err.message).toBe('timeout');
  });
});

