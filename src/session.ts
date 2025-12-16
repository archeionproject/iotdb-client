import { backOff } from 'exponential-backoff';
import Int64 from 'node-int64';

import { Client } from '../generated/IClientRPCService';
import { TSOpenSessionReq } from '../generated/client_types';
import { TSStatus } from '../generated/common_types';
import { Compression, DataType, Encoding } from './enums';
import { IoTDBError } from './errors';
import { IIoTDBClient } from './interfaces';
import { QueryResult } from './query-result';
import { AllowedValues, Value } from './types';
import { valuesToBuffer } from './utils';

export class Session implements IIoTDBClient {
  private id?: Int64;
  private statementId?: Int64;

  public get $client(): Client {
    return this.client;
  }

  public constructor(
    private options: TSOpenSessionReq,
    private client: Client,
  ) {}

  public async open(): Promise<void> {
    const sessionResponse = await this.client.openSession(this.options);
    if (sessionResponse.status.code !== 200) {
      throw new Error(`Cannot open session: ${sessionResponse.status.message}`);
    }

    if (sessionResponse.sessionId == null) {
      throw new Error('Malformed session response cannot find session id');
    }

    this.id = sessionResponse.sessionId;

    this.statementId = await this.client.requestStatementId(this.id);
  }

  public async createTimeSeries(
    paths: string | string[],
    types: DataType | DataType[],
    tags?: { [k: string]: string } | { [k: string]: string }[],
    encodings?: Encoding | Encoding[],
    compressions?: Compression | Compression[],
  ): Promise<void> {
    this.assertOpenSession();

    if (typeof paths === 'string') {
      paths = [paths];
    }

    if (!Array.isArray(types)) {
      types = [types];
    }

    if (!Array.isArray(tags)) {
      tags = tags == null ? undefined : [tags as { [k: string]: string }];
    }
    if (!Array.isArray(encodings)) {
      encodings =
        encodings == null
          ? new Array(paths.length).fill(Encoding.PLAIN, 0, paths.length)
          : [encodings];
    }
    if (!Array.isArray(compressions)) {
      compressions =
        compressions == null
          ? new Array(paths.length).fill(
              Compression.UNCOMPRESSED,
              0,
              paths.length,
            )
          : [compressions];
    }

    const response = await this.client.createMultiTimeseries({
      sessionId: this.id!,
      paths,
      dataTypes: types,
      tagsList: tags,
      encodings: encodings,
      compressors: compressions,
    });

    this.assertSuccess(response);
  }

  public async deleteTimeSeries(path: string | string[]): Promise<void> {
    this.assertOpenSession();

    const response = await this.client.deleteTimeseries(
      this.id!,
      Array.isArray(path) ? path : [path],
    );

    this.assertSuccess(response);
  }

  public async insertMeasurement<T extends DataType>(
    path: string,
    measurement: string,
    time: Date,
    value: AllowedValues<T>,
    type?: T,
  ): Promise<void> {
    this.assertOpenSession();

    const types = type == null ? [] : [type];
    const response = await this.client.insertRecord({
      sessionId: this.id!,
      measurements: [measurement],
      timestamp: new Int64(time.getTime()),
      values: valuesToBuffer([value], types),
      prefixPath: path,
    });

    this.assertSuccess(response);
  }

  public async insertMeasurements(
    path: string,
    measurements: string[],
    time: Date,
    values: Value[],
    types?: DataType[],
  ): Promise<void> {
    this.assertOpenSession();

    const response = await this.client.insertRecord({
      sessionId: this.id!,
      measurements,
      timestamp: new Int64(time.getTime()),
      values: valuesToBuffer(values, types),
      prefixPath: path,
    });

    this.assertSuccess(response);
  }

  public async rawUpdate(update: string): Promise<void> {
    this.assertOpenSession();

    const response = await this.client.executeUpdateStatementV2({
      sessionId: this.id!,
      statementId: this.statementId!,
      statement: update,
    });

    this.assertSuccess(response.status);
  }

  public async rawQuery(
    query: string,
    options = { fetchSize: 5000 },
  ): Promise<QueryResult> {
    this.assertOpenSession();

    const result = await backOff(
      async () => {
        const result = await this.client.executeQueryStatement({
          sessionId: this.id!,
          statementId: this.statementId!,
          statement: query,
          fetchSize: options.fetchSize,
        });

        this.assertSuccess(result.status);
        return result;
      },
      {
        delayFirstAttempt: false,
        retry: async (err) => {
          if (err instanceof IoTDBError && err.needRetry === true) {
            this.statementId = await this.client.requestStatementId(this.id!);
            return true;
          }
          return false;
        },
      },
    );

    return new QueryResult(
      this.id!,
      query,
      result,
      options.fetchSize,
      this.client,
    );
  }

  public async close(): Promise<void> {
    this.assertOpenSession();

    const response = await this.client.closeSession({ sessionId: this.id! });

    if (response.code !== 200) {
      throw new IoTDBError(response);
    }
  }

  private assertOpenSession(): void {
    if (this.id == null || this.statementId == null) {
      throw new Error('Inconsistent status, did you close before opening?');
    }
  }

  private assertSuccess(status: TSStatus): void {
    if (status.code != 200) {
      throw new IoTDBError(status);
    }
  }
}
