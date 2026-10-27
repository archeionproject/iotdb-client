import { setTimeout } from 'timers/promises';

import { cliExec, timeseriesExists } from '../utils/database';
import { getClient } from '../utils/services';
import { randomProperty, randomTimeSeries } from '../utils/timeseries';

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
    });
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
      await client.$session(async (s) => {
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

    it('should read text columns and nulls in the right place', async () => {
      const device = randomTimeSeries();
      const statements = [
        `CREATE TIMESERIES ${device}.reading WITH DATATYPE=TEXT, ENCODING=PLAIN`,
        `CREATE TIMESERIES ${device}.txHash WITH DATATYPE=TEXT, ENCODING=PLAIN`,
        `CREATE TIMESERIES ${device}.temperature WITH DATATYPE=DOUBLE, ENCODING=PLAIN`,
        `CREATE TIMESERIES ${device}.enabled WITH DATATYPE=BOOLEAN, ENCODING=PLAIN`,
        `INSERT INTO ${device}(timestamp, reading, txHash, temperature) VALUES (${time1}, 'first', '0xabc', 1.5)`,
        `INSERT INTO ${device}(timestamp, reading, enabled) VALUES (${time2}, 'second', true)`,
        `INSERT INTO ${device}(timestamp, reading, txHash, temperature, enabled) VALUES (${time2 + 1000}, 'third', '0xdef', 3.5, false)`,
      ];
      for (const statement of statements) {
        await client.rawUpdate(statement);
      }

      const rows = await client.$session(async (s) => {
        await using queryResult = await s.rawQuery(
          `SELECT reading, txHash, temperature, enabled FROM ${device};`,
          { fetchSize: 5000 },
        );

        const results = [];
        for await (const r of queryResult.rows()) {
          results.push(r);
        }
        return results;
      });

      expect(rows).toEqual([
        {
          time: new Date(time1),
          [`${device}.reading`]: 'first',
          [`${device}.txHash`]: '0xabc',
          [`${device}.temperature`]: 1.5,
          [`${device}.enabled`]: undefined,
        },
        {
          time: new Date(time2),
          [`${device}.reading`]: 'second',
          [`${device}.txHash`]: undefined,
          [`${device}.temperature`]: undefined,
          [`${device}.enabled`]: true,
        },
        {
          time: new Date(time2 + 1000),
          [`${device}.reading`]: 'third',
          [`${device}.txHash`]: '0xdef',
          [`${device}.temperature`]: 3.5,
          [`${device}.enabled`]: false,
        },
      ]);
    });

    it('should handle multiple parallel sessions with multiple queries', async () => {
      // See https://github.com/archeionproject/iotdb-client/issues/1
      // Allow all the sessions to run at the same time
      const parallelClient = getClient({ maxConnections: 100 });
      await parallelClient.$connect();
      const promises = [];
      for (let i = 0; i < 100; i++) {
        const p = parallelClient.$session(async (s) => {
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
      await parallelClient.$disconnect();
    });
  });
});
