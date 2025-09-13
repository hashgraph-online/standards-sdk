import { sleep } from '../../src/utils/sleep';

describe('sleep', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('should resolve after the specified milliseconds', async () => {
    const sleepPromise = sleep(1000);

    jest.advanceTimersByTime(1000);

    await expect(sleepPromise).resolves.toBeUndefined();
  });

  test('should work with zero milliseconds', async () => {
    const sleepPromise = sleep(0);

    jest.advanceTimersByTime(0);

    await expect(sleepPromise).resolves.toBeUndefined();
  });

  test('should work with large millisecond values', async () => {
    const sleepPromise = sleep(5000);

    jest.advanceTimersByTime(5000);

    await expect(sleepPromise).resolves.toBeUndefined();
  });
});
