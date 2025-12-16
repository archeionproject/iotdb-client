import { setTimeout } from 'timers/promises';

import { cliExec, timeseriesExists } from '../utils/database';
import { getClient } from '../utils/services';
import {
  randomProperty,
  randomTimeSeries,
} from '../utils/timeseries';

describe('Raw Operations', () => {
  const client = getClient();
  beforeAll(async () => {
    await client.$connect();
  });

  afterAll(async () => {
    await client.$disconnect();
  });

  describe('update operations', () => {
    it('should execute a raw create timeseries', async () => {
      const testTimeseries = randomTimeSeries();
      const createStatement = `CREATE TIMESERIES ${testTimeseries} WITH DATATYPE=INT64, ENCODING=RLE, COMPRESSOR=SNAPPY`;

      await client.rawUpdate(createStatement);

      await expect(timeseriesExists(testTimeseries)).resolves.toBe(true);
    })
  });

  describe('query operations', () => {
    const testTimeseries = randomTimeSeries();
    const testProperty = randomProperty();
    const time1 = 1672531200000;
    const time2 = 1672531201000;

    beforeAll(async () => {
      await cliExec(
        `INSERT INTO ${testTimeseries} (timestamp, ${testProperty}) VALUES (${time1}, 25.5); INSERT INTO ${testTimeseries} (timestamp, ${testProperty}) VALUES (${time2}, 26.0)`,
      );
    }, 15000);

    it('should execute a raw query and iterate over results', async () => {
      client.$session(async (s) => {
        await using queryResult = await s.rawQuery(
          `SELECT ${testProperty} FROM ${testTimeseries};`,
          {
            fetchSize: 1,
          },
        );

        const rows = queryResult.rows();
        const results = [];
        for await (const r of rows) {
          results.push(r[`${testTimeseries}.${testProperty}`]);
        }

        expect(results).toEqual([25.5, 26.0]);
      });
    });

    it('should handle multiple parallel sessions with multiple queries', async () => {
      // See https://github.com/archeionproject/iotdb-client/issues/1
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const p = client.$session(async (s) => {
          await using countResult = await s.rawQuery(
            `select count(${testProperty}) from  ${testTimeseries} ;`,
            { fetchSize: 1 },
          );
          const rows = countResult.rows();
          // eslint-disable-next-line @typescript-eslint/no-unused-expressions
          (await rows.next()).value;
          await rows.return();
          await setTimeout(1000);
          const result = await s.rawQuery(
            `select ${testProperty} from ${testTimeseries};`,
            {
              fetchSize: 10,
            },
          );
          const output = [];
          for await (const r of result.rows()) {
            output.push(r[`${testTimeseries}.${testProperty}`]);
          }

          await result.close();
          return output;
        });
        promises.push(p);
      }
      await Promise.all(promises);
    });
  });
});
