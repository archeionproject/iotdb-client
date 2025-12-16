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
});
