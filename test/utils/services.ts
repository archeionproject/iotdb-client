import { IoTDBClient, IoTDBPoolOptions } from '../../src';
import {
  DATABASE_HOST,
  DATABASE_PASSWORD,
  DATABASE_PORT,
  DATABASE_USERNAME,
} from './constants';

export function getClient(poolOptions?: IoTDBPoolOptions): IoTDBClient {
  return new IoTDBClient(DATABASE_HOST, DATABASE_PORT, {
    zoneId: 'UTC+1',
    username: DATABASE_USERNAME,
    password: DATABASE_PASSWORD,
    ...poolOptions,
  });
}

export function getClientWithInvalidHost(): IoTDBClient {
  return new IoTDBClient('invalid_host', DATABASE_PORT, {
    zoneId: 'UTC+1',
    username: DATABASE_USERNAME,
    password: DATABASE_PASSWORD,
  });
}
