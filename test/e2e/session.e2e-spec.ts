import { setTimeout } from 'timers/promises';

import { Session } from '../../src/session';
import { getClient } from '../utils/services';
import { randomProperty, randomTimeSeries } from '../utils/timeseries';

describe('Session lifecycle', () => {
  const client = getClient();

  beforeEach(async () => {
    await client.$connect();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await client.$disconnect();
  });

  it('should create a session and close it', async () => {
    const openSpy = jest.spyOn(Session.prototype, 'open');
    const closeSpy = jest.spyOn(Session.prototype, 'close');
    const callback = jest.fn();

    await client.$session(callback);

    expect(openSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
    expect(callback).toHaveBeenCalled();
  });

  it('should manage multiple async sessions', async () => {
    const openSpy = jest.spyOn(Session.prototype, 'open');
    const closeSpy = jest.spyOn(Session.prototype, 'close');
    const callback = jest.fn();

    await Promise.all(
      Array.from({ length: 10 }, () => client.$session(callback)),
    );

    expect(openSpy).toHaveBeenCalledTimes(10);
    expect(closeSpy).toHaveBeenCalledTimes(10);
    expect(callback).toHaveBeenCalledTimes(10);
  });

  it('should not be affected by other sessions closing', async () => {
    const device = randomTimeSeries();

    const result = client.$session(async (session) => {
      // Open and close another session while this one is still running
      await client.$session(() => undefined);

      await session.rawUpdate(
        `CREATE TIMESERIES ${device}.${randomProperty()} WITH DATATYPE=DOUBLE, ENCODING=PLAIN`,
      );
    });

    await expect(result).resolves.toBeUndefined();
  });

  it('should run at most maxConnections sessions at a time', async () => {
    const pooledClient = getClient({ maxConnections: 2 });
    await pooledClient.$connect();

    let running = 0;
    let maxRunning = 0;
    await Promise.all(
      Array.from({ length: 10 }, () =>
        pooledClient.$session(async () => {
          running++;
          maxRunning = Math.max(maxRunning, running);
          await setTimeout(10);
          running--;
        }),
      ),
    );

    expect(maxRunning).toBe(2);
    expect(pooledClient['pool']['connections'].size).toBe(2);
    await pooledClient.$disconnect();
  });

  it('should reconnect if client was disconnected', async () => {
    const callback = jest.fn();

    await client.$session(callback);

    expect(callback).toHaveBeenCalled();
    callback.mockClear();

    // Simulate the server dropping the connections
    await Promise.all(
      [...client['pool']['connections']].map(
        ({ connection }) =>
          new Promise((resolve) => {
            connection.once('close', resolve);
            connection.connection.destroy();
          }),
      ),
    );
    expect(client.connected).toBe(false);

    await client.$session(callback);

    expect(callback).toHaveBeenCalled();
    expect(client.connected).toBe(true);
  });
});
