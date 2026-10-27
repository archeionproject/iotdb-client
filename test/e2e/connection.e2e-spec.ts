import { IoTDBClient } from '../../src';
import { DATABASE_HOST, DATABASE_PORT } from '../utils/constants';
import { getClient, getClientWithInvalidHost } from '../utils/services';

describe('Connection Lifecycle', () => {
  it('should connect and disconnect', async () => {
    const client = getClient();

    await client.$connect();
    expect(client.connected).toBe(true);
    await client.$disconnect();
    expect(client.connected).toBe(false);
  });

  it('should throw error if connection is not established', async () => {
    const client = getClientWithInvalidHost();

    await expect(client.$connect()).rejects.toThrow();
  });

  it('should throw error on connect if credentials are wrong', async () => {
    const client = new IoTDBClient(DATABASE_HOST, DATABASE_PORT, {
      zoneId: 'UTC+1',
      username: 'root',
      password: 'wrong-password',
    });

    await expect(client.$connect()).rejects.toThrow(/Cannot open session/);
    await client.$disconnect();
  });

  it('should disconnect a client that never connected', async () => {
    const client = getClient();

    await expect(client.$disconnect()).resolves.toBeUndefined();
  });
});
