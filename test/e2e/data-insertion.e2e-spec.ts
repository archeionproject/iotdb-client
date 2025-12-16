import { getClient } from '../utils/services';
import { randomMeasurement, randomTimeSeriesPath } from '../utils/timeseries';

describe('Insert methods', () => {
  const client = getClient();

  beforeEach(async () => {
    await client.$connect();
  });

  afterEach(async () => {
    await client.$disconnect();
  });

  it('should insert simple measurement', async () => {
    const path = randomTimeSeriesPath();

    await client.insertMeasurement(path, randomMeasurement(), new Date(), 42.0);
  });
});
