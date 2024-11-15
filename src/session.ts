import Int64 from 'node-int64';

import { Client } from '../generated/IClientRPCService';
import { TSOpenSessionReq } from '../generated/client_types';
import { TSStatus } from '../generated/common_types';
import { Compression, DataType, Encoding } from './enums';
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
    path: string,
    type: DataType,
    tags?: { [k: string]: string },
    encoding = Encoding.PLAIN,
    compression = Compression.UNCOMPRESSED,
  ): Promise<void> {
    this.assertOpenSession();

    const response = await this.client.createTimeseries({
      sessionId: this.id!,
      path,
      dataType: type,
      tags,
      encoding: encoding,
      compressor: compression,
    });

    this.assertSuccess(response);
  }

  public async deleteTimeSeries(path: string): Promise<void> {
    this.assertOpenSession();

    const response = await this.client.deleteTimeseries(
      this.id!,
      path.split('.'),
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

    const result = await this.client.executeQueryStatement({
      sessionId: this.id!,
      statementId: this.statementId!,
      statement: query,
      fetchSize: options.fetchSize,
    });

    this.assertSuccess(result.status);

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
      throw new Error(`Failed closing session: ${response.message}`);
    }
  }

  private assertOpenSession(): void {
    if (this.id == null || this.statementId == null) {
      throw new Error('Inconsistent status, did you close before opening?');
    }
  }

  private assertSuccess(status: TSStatus): void {
    if (status.code != 200) {
      throw new Error(`Request failed with message: ${status.message}`);
    }
  }
}
