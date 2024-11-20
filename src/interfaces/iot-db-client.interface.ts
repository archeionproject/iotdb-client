import { Compression, DataType, Encoding } from '../enums';
import { QueryResult } from '../query-result';
import { AllowedValues, Value } from '../types';

export interface IIoTDBClient {
  createTimeSeries(
    path: string,
    type: DataType,
    tags?: { [k: string]: string },
    encoding?: Encoding,
    compression?: Compression,
  ): Promise<void>;
  createTimeSeries(
    paths: string[],
    types: DataType[],
    tags?: { [k: string]: string }[],
    encodings?: Encoding[],
    compressions?: Compression[],
  ): Promise<void>;
  createTimeSeries(
    paths: string | string[],
    types: DataType | DataType[],
    tags?: { [k: string]: string } | { [k: string]: string }[],
    encodings?: Encoding | Encoding[],
    compressions?: Compression | Compression[],
  ): Promise<void>;

  deleteTimeSeries(path: string): Promise<void>;

  insertMeasurement<T extends DataType>(
    path: string,
    measurement: string,
    time: Date,
    value: AllowedValues<T>,
    type?: T,
  ): Promise<void>;

  insertMeasurements(
    path: string,
    measurements: string[],
    time: Date,
    values: Value[],
    types?: DataType[],
  ): Promise<void>;

  rawUpdate(update: string): Promise<void>;

  rawQuery(query: string, options: { fetchSize: number }): Promise<QueryResult>;
}
