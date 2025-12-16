import { Compression, DataType, Encoding } from '../../src/enums';
import { timeseriesExists } from '../utils/database';
import { getClient } from '../utils/services';
import { randomTimeSeriesPath } from '../utils/timeseries';

describe('Time Series', () => {
  const client = getClient();

  beforeEach(async () => {
    await client.$connect();
  });

  afterEach(async () => {
    await client.$disconnect();
  });

  it('should create a timeseries', async () => {
    const path = randomTimeSeriesPath();

    await client.createTimeSeries(path, DataType.FLOAT);

    expect(await timeseriesExists(path)).toBe(true);
  });

  it('should delete a timeseries', async () => {
    const path = randomTimeSeriesPath();

    await client.createTimeSeries(path, DataType.FLOAT);

    expect(await timeseriesExists(path)).toBe(true);

    await client.deleteTimeSeries(path);

    expect(await timeseriesExists(path)).toBe(false);
  });

  it('should create a timeseries with tags', async () => {
    const path = randomTimeSeriesPath();

    await client.createTimeSeries(path, DataType.FLOAT, { a: 'b', c: 'd' });
    expect(await timeseriesExists(path)).toBe(true);
  });

  it('should create a timeseries with tags and encodings', async () => {
    const path = randomTimeSeriesPath();

    await client.createTimeSeries(
      path,
      DataType.FLOAT,
      { a: 'b', c: 'd' },
      Encoding.PLAIN,
    );

    expect(await timeseriesExists(path)).toBe(true);
  });

  it('should create a timeseries with tags and encodings and compression', async () => {
    const path = randomTimeSeriesPath();

    await client.createTimeSeries(
      path,
      DataType.FLOAT,
      { a: 'b', c: 'd' },
      Encoding.PLAIN,
      Compression.UNCOMPRESSED,
    );

    expect(await timeseriesExists(path)).toBe(true);
  });

  it('should create multiple timeseries', async () => {
    const timeseries = Array.from({ length: 3 }, () => randomTimeSeriesPath());
    const dataTypes = Array.from({ length: 3 }, () => DataType.FLOAT);

    await client.createTimeSeries(timeseries, dataTypes);

    for (const path of timeseries) {
      expect(await timeseriesExists(path)).toBe(true);
    }
  });

  it('should throw if duplicate timeseries creation', async () => {
    const path = randomTimeSeriesPath();

    await client.createTimeSeries(path, DataType.FLOAT);

    await expect(client.createTimeSeries(path, DataType.FLOAT)).rejects.toThrow(
      /Path \[.*\] already exist/gm,
    );
  });

  it('should throw if client is not connected', async () => {
    const client = getClient();

    expect(client.connected).toBe(false);

    await expect(
      client.createTimeSeries(randomTimeSeriesPath(), DataType.FLOAT),
    ).rejects.toThrow(/Client is not connected/gm);
  });
});
