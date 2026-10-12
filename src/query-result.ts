import Int64 from 'node-int64';

import { Client } from '../generated/IClientRPCService';
import { TSExecuteStatementResp } from '../generated/client_types';
import { DataType } from './enums';
import { Row } from './types';

export class QueryResult implements AsyncDisposable {
  public static readonly TIMESTAMP_STR = 'Time';
  private static START_INDEX = 2;

  private columnTypeDeduplicatedList: any[];
  private columnNameList: string[] = [];
  private columnTypeList: DataType[] = [];
  private columnNameIndexMap: Record<string, number> = {};
  // Distinct columns to decode in each row, with the position of their buffers in the data set
  private columns: { name: string; location: number; dataType: DataType }[] =
    [];
  private queryId: Int64;
  private cachedResult: Required<
    Pick<TSExecuteStatementResp, 'moreData' | 'queryDataSet'>
  >;
  private closed = false;

  public constructor(
    private sessionId: Int64,
    private statement: string,
    query: TSExecuteStatementResp,
    private fetchSize: number,
    private client: Client,
  ) {
    if (!query.ignoreTimeStamp) {
      this.columnNameList.push(QueryResult.TIMESTAMP_STR);
      this.columnTypeList.push(DataType.INT64);
      this.columnNameIndexMap[QueryResult.TIMESTAMP_STR] = 1;
    }

    if (query.columns == null) {
      throw new Error('Malformed query result, missing column names');
    }
    if (query.dataTypeList == null) {
      throw new Error('Malformed query result, missing dataTypeList');
    }

    if (query.queryId == null) {
      throw new Error('Malformed query result, missing queryId');
    }

    if (query.queryDataSet == null) {
      throw new Error('Malformed query result, missing data');
    }

    this.queryId = query.queryId;
    this.cachedResult = {
      moreData: query.moreData ?? false,
      queryDataSet: query.queryDataSet,
    };

    if (query.columnNameIndexMap != null) {
      this.columnTypeDeduplicatedList = new Array(
        Object.keys(query.columnNameIndexMap).length,
      ).fill(null);
      for (let i = 0; i < query.columns.length; i++) {
        const name: string = query.columns[i];
        this.columnNameList.push(name);
        this.columnTypeList.push(
          DataType[query.dataTypeList[i] as keyof typeof DataType],
        );

        if (!(name in this.columnNameIndexMap)) {
          const index = query.columnNameIndexMap[name];
          this.columnNameIndexMap[name] = index + QueryResult.START_INDEX;
          this.columnTypeDeduplicatedList[index] =
            DataType[query.dataTypeList[i] as keyof typeof DataType];
        }
      }
    } else {
      let index = QueryResult.START_INDEX;
      this.columnTypeDeduplicatedList = [];
      for (let i = 0; i < query.columns.length; i++) {
        const name: string = query.columns[i];
        this.columnNameList.push(name);
        this.columnTypeList.push(
          DataType[query.dataTypeList[i] as keyof typeof DataType],
        );
        if (!(name in this.columnNameIndexMap)) {
          this.columnNameIndexMap[name] = index;
          index += 1;
          this.columnTypeDeduplicatedList.push(
            DataType[query.dataTypeList[i] as keyof typeof DataType],
          );
        }
      }
    }

    // Duplicated columns share the same value buffer, so each one must be read once per row.
    // Time is skipped as it has its own buffer
    for (const [name, index] of Object.entries(this.columnNameIndexMap)) {
      const location = index - QueryResult.START_INDEX;
      if (location >= 0) {
        this.columns.push({
          name,
          location,
          dataType: this.columnTypeDeduplicatedList[location],
        });
      }
    }
  }

  public async *rows(): AsyncGenerator<Row, void, unknown> {
    let hasMore = true;
    try {
      while (hasMore) {
        hasMore = this.cachedResult.moreData;
        const { time, valueList, bitmapList } = this.cachedResult.queryDataSet;

        // Calculate number of BigInt64 values
        const count = Math.floor(time.length / 8);
        // Each value buffer only holds the non-null values of its column, packed one after
        // the other, so every column needs its own read position
        const offsets = new Array<number>(valueList.length).fill(0);
        for (let i = 0; i < count; i++) {
          const timestamp = time.readBigInt64BE(i * 8);

          // Convert BigInt timestamp to Date
          const date = new Date(Number(timestamp).valueOf()); // Convert BigInt to Number for Date compatibility
          const result: Row = { time: date };

          for (const { name: columnName, location, dataType } of this.columns) {
            const valueBuffer = valueList[location];
            let offset = offsets[location];

            if (this.isNull(bitmapList[location], valueBuffer, offset, i)) {
              result[columnName] = undefined;
              continue;
            }

            switch (dataType) {
              case DataType.DOUBLE:
                result[columnName] = valueBuffer.readDoubleBE(offset);
                offset += 8;
                break;
              case DataType.FLOAT:
                result[columnName] = valueBuffer.readFloatBE(offset);
                offset += 4;
                break;
              case DataType.BOOLEAN:
                result[columnName] = valueBuffer.readUInt8(offset) > 0;
                offset += 1;
                break;
              case DataType.INT32:
                result[columnName] = valueBuffer.readInt32BE(offset);
                offset += 4;
                break;
              case DataType.DATE:
                // TODO: convert to date?
                result[columnName] = valueBuffer.readInt32BE(offset);
                offset += 4;
                break;
              case DataType.INT64:
                result[columnName] = valueBuffer.readBigInt64BE(offset);
                offset += 8;
                break;
              case DataType.TIMESTAMP:
                result[columnName] = new Date(
                  Number(valueBuffer.readBigInt64BE(offset)).valueOf(),
                );
                offset += 8;
                break;
              case DataType.TEXT:
              case DataType.STRING: {
                // Values are prefixed by their length as a 4 bytes integer
                const length = valueBuffer.readUInt32BE(offset);
                result[columnName] = valueBuffer
                  .subarray(offset + 4, offset + 4 + length)
                  .toString('utf-8');
                offset += 4 + length;
                break;
              }
              case DataType.BLOB: {
                const length = valueBuffer.readUInt32BE(offset);
                result[columnName] = valueBuffer.subarray(
                  offset + 4,
                  offset + 4 + length,
                );
                offset += 4 + length;
                break;
              }
              default:
                throw new Error(`Unsupported data type ${dataType}.`);
            }
            offsets[location] = offset;
          }
          yield result;
        }

        const fetchResults = await this.client.fetchResults({
          sessionId: this.sessionId,
          statement: this.statement,
          fetchSize: this.fetchSize,
          queryId: this.queryId,
          isAlign: true,
        });

        hasMore = fetchResults.hasResultSet ?? false;
        this.cachedResult.queryDataSet = fetchResults.queryDataSet!;
      }
    } finally {
      await this.close();
    }
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    try {
      await this.client.closeOperation({
        queryId: this.queryId,
        sessionId: this.sessionId,
      });
    } catch (error) {
      throw error;
    } finally {
      this.closed = true;
    }
  }

  public [Symbol.asyncDispose](): PromiseLike<void> {
    return this.close();
  }

  private isNull(
    bitmap: Buffer | undefined,
    valueBuffer: Buffer,
    offset: number,
    row: number,
  ): boolean {
    if (bitmap == null) {
      // Without a bitmap we can only detect trailing nulls
      return offset >= valueBuffer.length;
    }

    const mask = bitmap[Math.floor(row / 8)];
    // 7 - bitPosition because values are BE
    return (mask & (1 << (7 - (row % 8)))) === 0;
  }
}
