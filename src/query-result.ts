import Int64 from 'node-int64';

import { Client } from '../generated/IClientRPCService';
import { TSExecuteStatementResp } from '../generated/client_types';
import { DataType } from './enums';
import { Row } from './types';

export class QueryResult {
  public static readonly TIMESTAMP_STR = 'Time';
  private static START_INDEX = 2;

  private columTypeDeduplicatedList: any[];
  private columNameList: string[] = [];
  private columTypeList: DataType[] = [];
  private columNameIndexMap: Record<string, number> = {};
  private queryId: Int64;
  private ignoreTimeStamp: boolean;
  private columSize: number;
  private cachedResult: Required<
    Pick<TSExecuteStatementResp, 'moreData' | 'queryDataSet'>
  >;
  // Indexes used to read column values when there is nulls
  private columnCursors: Record<string, number> = {};
  private closed = false;

  public constructor(
    private sessionId: Int64,
    private statement: string,
    query: TSExecuteStatementResp,
    private fetchSize: number,
    private client: Client,
  ) {
    this.ignoreTimeStamp = query.ignoreTimeStamp ?? false;

    if (!query.ignoreTimeStamp) {
      this.columNameList.push(QueryResult.TIMESTAMP_STR);
      this.columTypeList.push(DataType.INT64);
      this.columNameIndexMap[QueryResult.TIMESTAMP_STR] = 1;
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
    this.columSize = query.columns.length;
    this.cachedResult = {
      moreData: query.moreData ?? false,
      queryDataSet: query.queryDataSet,
    };

    if (query.columnNameIndexMap != null) {
      this.columTypeDeduplicatedList = new Array(
        Object.keys(query.columnNameIndexMap).length,
      ).fill(null);
      for (let i = 0; i < query.columns.length; i++) {
        const name: string = query.columns[i];
        this.columNameList.push(name);
        this.columTypeList.push(
          DataType[query.dataTypeList[i] as keyof typeof DataType],
        );

        if (!(name in this.columNameIndexMap)) {
          const index = query.columnNameIndexMap[name];
          this.columNameIndexMap[name] = index + QueryResult.START_INDEX;
          this.columTypeDeduplicatedList[index] =
            DataType[query.dataTypeList[i] as keyof typeof DataType];
        }
      }
    } else {
      let index = QueryResult.START_INDEX;
      this.columTypeDeduplicatedList = [];
      for (let i = 0; i < query.columns.length; i++) {
        const name: string = query.columns[i];
        this.columNameList.push(name);
        this.columTypeList.push(
          DataType[query.dataTypeList[i] as keyof typeof DataType],
        );
        if (!(name in this.columNameIndexMap)) {
          this.columNameIndexMap[name] = index;
          index += 1;
          this.columTypeDeduplicatedList.push(
            DataType[query.dataTypeList[i] as keyof typeof DataType],
          );
        }
      }
    }
  }

  public async *rows(): AsyncGenerator<Row, void, unknown> {
    let hasMore = true;
    while (hasMore) {
      hasMore = this.cachedResult.moreData;
      const result: Row = {};

      // Calculate number of BigInt64 values
      const count = Math.floor(this.cachedResult.queryDataSet.time.length / 8);
      // Read each BigInt64 and convert to Date
      let bufferOffset = 0;
      for (let i = 0; i < count; i++) {
        const timestamp = this.cachedResult.queryDataSet.time.readBigInt64BE(
          i * 8,
        );

        // Convert BigInt timestamp to Date
        const date = new Date(Number(timestamp).valueOf()); // Convert BigInt to Number for Date compatibility
        result['time'] = date;

        for (let ci = 0; ci < this.columSize; ci++) {
          let columnName: string;
          if (this.ignoreTimeStamp) {
            columnName = this.columNameList[ci];
          } else {
            columnName = this.columNameList[ci + 1];
          }

          const location =
            this.columNameIndexMap[columnName] - QueryResult.START_INDEX;
          if (location < 0) {
            continue;
          }

          const dataType = this.columTypeDeduplicatedList[location];
          const valueBuffer =
            this.cachedResult.queryDataSet.valueList[location];

          const valueBufferLen = valueBuffer.length;
          let index;

          switch (dataType) {
            case DataType.DOUBLE:
              if (i >= valueBufferLen / 8) {
                result[columnName] = undefined;
                break;
              }
              result[columnName] = valueBuffer.readDoubleBE(i * 8);
              break;
            case DataType.FLOAT:
              if (i >= valueBufferLen / 4) {
                result[columnName] = undefined;
                break;
              }

              result[columnName] = valueBuffer.readFloatBE(i * 4);
              break;
            case DataType.BOOLEAN:
              index = this.getIndex(
                valueBufferLen,
                count,
                i,
                columnName,
                this.cachedResult.queryDataSet.bitmapList[location],
              );
              if (index < 0) {
                result[columnName] = undefined;
                break;
              }

              result[columnName] = valueBuffer.readUInt8(index) > 0;
              break;
            case DataType.INT32:
              if (i >= valueBufferLen) {
                result[columnName] = undefined;
                break;
              }
              result[columnName] = valueBuffer.readInt32BE(i * 4);
              break;
            case DataType.DATE:
              if (i >= valueBufferLen) {
                result[columnName] = undefined;
                break;
              }
              // TODO: convert to date?
              result[columnName] = valueBuffer.readInt32BE(i * 4);
              break;
            case DataType.INT64:
              if (i >= valueBufferLen) {
                result[columnName] = undefined;
                break;
              }
              result[columnName] = valueBuffer.readBigInt64BE(i * 8);
              break;
            case DataType.TIMESTAMP:
              if (i >= valueBufferLen) {
                result[columnName] = undefined;
                break;
              }
              result[columnName] = new Date(
                Number(valueBuffer.readBigInt64BE(i * 8)).valueOf(),
              );
              break;
            case DataType.TEXT:
            case DataType.STRING: {
              if (valueBufferLen === 0) {
                result[columnName] = undefined;
                break;
              }
              const length = valueBuffer.readUInt32BE(bufferOffset);
              result[columnName] = valueBuffer
                .subarray(bufferOffset + 4, bufferOffset + 4 + length)
                .toString('utf-8');
              bufferOffset += 4 + length;
              break;
            }
            case DataType.BLOB: {
              if (valueBufferLen === 0) {
                result[columnName] = undefined;
                break;
              }

              const length = valueBuffer.readUInt32BE(bufferOffset);
              result[columnName] = valueBuffer.subarray(
                bufferOffset + 4,
                bufferOffset + 4 + length,
              );
              bufferOffset += 4 + length;
              break;
            }
            default:
              throw new Error(`Unsupported data type ${dataType}.`);
          }
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

  private getIndex(
    valueBufferLen: number,
    totalLen: number,
    currentIndex: number,
    column: string,
    bitmap?: Buffer,
  ): number {
    if (valueBufferLen > 0 && valueBufferLen != totalLen && bitmap != null) {
      // Bitmap mode; there are nulls around
      const mask = bitmap[Math.floor(currentIndex / 8)];
      // 7 - bitPosition because values are BE
      const isThere = (mask & (1 << (7 - (currentIndex % 8)))) !== 0;

      if (!isThere) {
        return -1;
      }

      const index = (this.columnCursors[column] ?? -1) + 1;
      this.columnCursors[column] = index;

      return index;
    }

    if (currentIndex >= valueBufferLen) {
      return -1;
    }

    return currentIndex;
  }
}
