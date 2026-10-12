import Int64 from 'node-int64';

import { Client } from '../../generated/IClientRPCService';
import {
  TSExecuteStatementResp,
  TSFetchResultsResp,
  TSQueryDataSet,
} from '../../generated/client_types';
import { QueryResult } from '../../src/query-result';
import { Row } from '../../src/types';
import {
  allPresent,
  binaryBuffer,
  bitmap,
  booleanBuffer,
  doubleBuffer,
  floatBuffer,
  int32Buffer,
  int64Buffer,
  textBuffer,
} from '../utils/query-data-set';

const DEVICE = 'root.sg.d1';

// Client returning the given batches, one for each fetch, and then no more results
function createClient(...nextBatches: TSQueryDataSet[]): {
  client: Client;
  fetchResults: jest.Mock;
  closeOperation: jest.Mock;
} {
  const fetchResults = jest.fn(
    async (): Promise<Partial<TSFetchResultsResp>> => {
      const queryDataSet = nextBatches.shift();
      return { hasResultSet: queryDataSet != null, queryDataSet };
    },
  );
  const closeOperation = jest.fn(async () => ({ code: 200 }));

  return {
    client: { fetchResults, closeOperation } as unknown as Client,
    fetchResults,
    closeOperation,
  };
}

function createQueryResult(
  response: Partial<TSExecuteStatementResp>,
  client: Client,
): QueryResult {
  return new QueryResult(
    new Int64(1),
    'select',
    {
      queryId: new Int64(1),
      ignoreTimeStamp: false,
      moreData: false,
      ...response,
    } as TSExecuteStatementResp,
    10,
    client,
  );
}

async function collect(queryResult: QueryResult): Promise<Row[]> {
  const rows: Row[] = [];
  for await (const row of queryResult.rows()) {
    rows.push(row);
  }
  return rows;
}

describe('QueryResult', () => {
  it('should read consecutive text columns from their own buffers', async () => {
    const { client } = createClient();
    const queryResult = createQueryResult(
      {
        columns: [`${DEVICE}.value`, `${DEVICE}.txHash`],
        dataTypeList: ['STRING', 'TEXT'],
        queryDataSet: {
          time: int64Buffer(1000, 2000),
          valueList: [
            textBuffer('first', 'second'),
            textBuffer('0xabc', '0xdef'),
          ],
          bitmapList: [allPresent(2), allPresent(2)],
        },
      },
      client,
    );

    await expect(collect(queryResult)).resolves.toEqual([
      {
        time: new Date(1000),
        [`${DEVICE}.value`]: 'first',
        [`${DEVICE}.txHash`]: '0xabc',
      },
      {
        time: new Date(2000),
        [`${DEVICE}.value`]: 'second',
        [`${DEVICE}.txHash`]: '0xdef',
      },
    ]);
  });

  it('should use the bitmap to skip null values', async () => {
    const { client } = createClient();
    const queryResult = createQueryResult(
      {
        columns: [`${DEVICE}.temperature`, `${DEVICE}.txHash`, `${DEVICE}.on`],
        dataTypeList: ['DOUBLE', 'TEXT', 'BOOLEAN'],
        queryDataSet: {
          time: int64Buffer(1000, 2000, 3000),
          // Value buffers only hold the non-null values
          valueList: [
            doubleBuffer(1.5, 3.5),
            textBuffer('0xabc'),
            booleanBuffer(true, false),
          ],
          bitmapList: [
            bitmap(true, false, true),
            bitmap(false, true, false),
            bitmap(false, true, true),
          ],
        },
      },
      client,
    );

    await expect(collect(queryResult)).resolves.toEqual([
      {
        time: new Date(1000),
        [`${DEVICE}.temperature`]: 1.5,
        [`${DEVICE}.txHash`]: undefined,
        [`${DEVICE}.on`]: undefined,
      },
      {
        time: new Date(2000),
        [`${DEVICE}.temperature`]: undefined,
        [`${DEVICE}.txHash`]: '0xabc',
        [`${DEVICE}.on`]: true,
      },
      {
        time: new Date(3000),
        [`${DEVICE}.temperature`]: 3.5,
        [`${DEVICE}.txHash`]: undefined,
        [`${DEVICE}.on`]: false,
      },
    ]);
  });

  it('should decode every supported data type', async () => {
    const { client } = createClient();
    const queryResult = createQueryResult(
      {
        columns: ['i32', 'i64', 'f', 'd', 'b', 'ts', 'dt', 'blob', 's'],
        dataTypeList: [
          'INT32',
          'INT64',
          'FLOAT',
          'DOUBLE',
          'BOOLEAN',
          'TIMESTAMP',
          'DATE',
          'BLOB',
          'STRING',
        ],
        queryDataSet: {
          time: int64Buffer(1000, 2000),
          valueList: [
            int32Buffer(-7, 42),
            int64Buffer(-7n, 42n),
            floatBuffer(0.5, -2.25),
            doubleBuffer(1.25, -3.75),
            booleanBuffer(false, true),
            int64Buffer(5000, 6000),
            int32Buffer(20240101, 20241231),
            binaryBuffer(Buffer.from([1, 2]), Buffer.from([3])),
            textBuffer('àè', ''),
          ],
          bitmapList: new Array(9).fill(allPresent(2)),
        },
      },
      client,
    );

    await expect(collect(queryResult)).resolves.toEqual([
      {
        time: new Date(1000),
        i32: -7,
        i64: -7n,
        f: 0.5,
        d: 1.25,
        b: false,
        ts: new Date(5000),
        dt: 20240101,
        blob: Buffer.from([1, 2]),
        s: 'àè',
      },
      {
        time: new Date(2000),
        i32: 42,
        i64: 42n,
        f: -2.25,
        d: -3.75,
        b: true,
        ts: new Date(6000),
        dt: 20241231,
        blob: Buffer.from([3]),
        s: '',
      },
    ]);
  });

  it('should read duplicated columns once per row', async () => {
    const { client } = createClient();
    const queryResult = createQueryResult(
      {
        columns: ['s', 's'],
        dataTypeList: ['TEXT', 'TEXT'],
        columnNameIndexMap: { s: 0 },
        queryDataSet: {
          time: int64Buffer(1000, 2000),
          valueList: [textBuffer('a', 'b')],
          bitmapList: [allPresent(2)],
        },
      },
      client,
    );

    await expect(collect(queryResult)).resolves.toEqual([
      { time: new Date(1000), s: 'a' },
      { time: new Date(2000), s: 'b' },
    ]);
  });

  it('should restart reading positions on every fetched batch', async () => {
    const { client, fetchResults, closeOperation } = createClient({
      time: int64Buffer(3000, 4000),
      valueList: [textBuffer('c'), booleanBuffer(true)],
      bitmapList: [bitmap(false, true), bitmap(true, false)],
    });
    const queryResult = createQueryResult(
      {
        columns: ['s', 'b'],
        dataTypeList: ['TEXT', 'BOOLEAN'],
        queryDataSet: {
          time: int64Buffer(1000, 2000),
          valueList: [textBuffer('a', 'b'), booleanBuffer(false)],
          bitmapList: [allPresent(2), bitmap(false, true)],
        },
      },
      client,
    );

    await expect(collect(queryResult)).resolves.toEqual([
      { time: new Date(1000), s: 'a', b: undefined },
      { time: new Date(2000), s: 'b', b: false },
      { time: new Date(3000), s: undefined, b: true },
      { time: new Date(4000), s: 'c', b: undefined },
    ]);
    expect(fetchResults).toHaveBeenCalledTimes(2);
    expect(closeOperation).toHaveBeenCalledTimes(1);
  });
});
