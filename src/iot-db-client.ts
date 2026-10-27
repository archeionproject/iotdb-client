import { TSOpenSessionReq } from '../generated/client_types';
import { ConnectionPool } from './connection-pool';
import { Compression, DataType, Encoding } from './enums';
import { IIoTDBClient, IoTDBPoolOptions } from './interfaces';
import { QueryResult } from './query-result';
import { Session } from './session';
import { AllowedValues, Value } from './types';

export class IoTDBClient implements IIoTDBClient {
  private pool: ConnectionPool;

  public get connected(): boolean {
    return this.pool.connected;
  }

  public constructor(
    host: string,
    port: number,
    private options: Pick<
      TSOpenSessionReq,
      'zoneId' | 'username' | 'password'
    > &
      IoTDBPoolOptions = { zoneId: 'UTC+1', username: 'root' },
  ) {
    this.pool = new ConnectionPool(host, port, options.maxConnections);
  }

  /**
   * Optional, sessions connect on demand. Opens and closes a session to fail
   * fast when the server is unreachable or the credentials are wrong.
   */
  public async $connect(): Promise<void> {
    await this.$session(() => undefined);
  }

  public async $session<T>(
    callback: (client: IIoTDBClient) => T | Promise<T>,
  ): Promise<T> {
    const sessionOptions = {
      ...this.options,
      client_protocol: 2,
      configuration: {
        version: 'V_1_0',
        sql_dialect: 'tree',
      },
    };

    const pooled = await this.pool.acquire();
    try {
      const session = new Session(sessionOptions, pooled.client);
      await session.open();
      try {
        return await callback(session);
      } finally {
        await session.close();
      }
    } finally {
      this.pool.release(pooled);
    }
  }

  public async createTimeSeries(
    paths: string | string[],
    types: DataType | DataType[],
    tags?: { [k: string]: string } | { [k: string]: string }[],
    encodings?: Encoding | Encoding[],
    compressions?: Compression | Compression[],
  ): Promise<void> {
    return this.$session((client) =>
      client.createTimeSeries(paths, types, tags, encodings, compressions),
    );
  }

  public deleteTimeSeries(path: string | string[]): Promise<void> {
    return this.$session((client) => client.deleteTimeSeries(path));
  }

  public insertMeasurement<T extends DataType>(
    path: string,
    measurement: string,
    time: Date,
    value: AllowedValues<T>,
    type?: T,
  ): Promise<void> {
    return this.$session((client) =>
      client.insertMeasurement(path, measurement, time, value, type),
    );
  }

  public insertMeasurements(
    path: string,
    measurements: string[],
    time: Date,
    values: Value[],
    types?: DataType[],
  ): Promise<void> {
    return this.$session((client) =>
      client.insertMeasurements(path, measurements, time, values, types),
    );
  }

  public rawUpdate(update: string): Promise<void> {
    return this.$session((client) => client.rawUpdate(update));
  }

  public rawQuery(): Promise<QueryResult> {
    throw new Error('Not implemented yet, use $session to create queries');
  }

  public async $disconnect(): Promise<void> {
    await this.pool.disconnect();
  }
}
