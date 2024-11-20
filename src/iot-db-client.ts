import {
  Connection,
  TFramedTransport,
  createClient,
  createConnection,
} from 'thrift';

import { Client } from '../generated/IClientRPCService';
import { TSOpenSessionReq } from '../generated/client_types';
import { Compression, DataType, Encoding } from './enums';
import { IIoTDBClient } from './interfaces';
import { QueryResult } from './query-result';
import { Session } from './session';
import { AllowedValues, Value } from './types';

export class IoTDBClient implements IIoTDBClient {
  private client?: Client;
  private connection?: Connection;

  public constructor(
    private host: string,
    private port: number,
    private options: Pick<
      TSOpenSessionReq,
      'zoneId' | 'username' | 'password'
    > = { zoneId: 'UTC+1', username: 'root' },
  ) {}

  public async $connect(): Promise<void> {
    const connection = createConnection(this.host, this.port, {
      transport: TFramedTransport,
    });
    this.connection = connection;
    this.client = createClient(Client, connection);

    return new Promise((resolve, reject) => {
      connection.once('connect', resolve);
      connection.once('error', reject);
    });
  }

  public async $session<T>(
    callback: (client: IIoTDBClient) => T | Promise<T>,
  ): Promise<T> {
    if (this.client == null) {
      throw new Error('Client not connected');
    }
    const sessionOptions = {
      ...this.options,
      client_protocol: 2,
      configuration: {
        version: 'V_1_0',
        sql_dialect: 'tree',
      },
    };

    const session = new Session(sessionOptions, this.client);
    await session.open();
    try {
      const result = await callback(session);
      return result;
    } catch (error) {
      throw error;
    } finally {
      await session.close();
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

  public deleteTimeSeries(path: string): Promise<void> {
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
    if (this.connection == null) {
      throw new Error('Client not connected');
    }

    const connection = this.connection;
    const promise = new Promise<void>((resolve, reject) => {
      connection.once('close', resolve);
      connection.once('error', reject);
    });
    this.connection.destroy();
    return promise;
  }
}
