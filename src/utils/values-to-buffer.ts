import Int64 from 'node-int64';

import { DataType } from '../enums';
import { Value } from '../types';

const nonNumericDataTypes = [
  DataType.TEXT,
  DataType.TIMESTAMP,
  DataType.DATE,
  DataType.BLOB,
  DataType.STRING,
];

export function valuesToBuffer(
  values: Value[],
  types: DataType[] = [],
): Buffer {
  let result = Buffer.alloc(0);

  if (types.length != 0 && types.length != values.length) {
    throw new Error(
      `When declaring value type the length of the two arrays should match: values length ${values.length} types length ${types.length} `,
    );
  }

  for (const [i, value] of values.entries()) {
    const type = typeof value;
    const suggested = types[i];
    switch (type) {
      case 'boolean':
        if (suggested != null && suggested != DataType.BOOLEAN) {
          throw new Error(
            `Boolean value cannot be converted to ${DataType[suggested]}`,
          );
        }

        const boolean = Buffer.alloc(2);
        boolean.writeUInt8(DataType.BOOLEAN);
        boolean.writeUint8(value ? 1 : 0, 1);
        result = Buffer.concat([result, boolean]);
        break;
      case 'number':
        if (suggested != null && nonNumericDataTypes.includes(suggested)) {
          throw new Error(
            `Number value cannot be converted to ${DataType[suggested]}`,
          );
        }

        const codeType = suggested ?? DataType.FLOAT;
        const payload = Buffer.alloc(
          codeType === DataType.FLOAT || codeType === DataType.INT32 ? 5 : 9,
        );
        payload.writeUint8(codeType);

        switch (codeType) {
          case DataType.INT32:
            payload.writeInt32BE(value as number, 1);
            break;
          case DataType.INT64:
            payload.writeBigInt64BE(value as bigint, 1);
            break;
          case DataType.FLOAT:
            payload.writeFloatBE(value as number, 1);
            break;
          case DataType.DOUBLE:
            payload.writeDoubleBE(value as number, 1);
            break;
          default:
            throw new Error(
              `Can't encode this number to type ${DataType[codeType]}`,
            );

            break;
        }

        result = Buffer.concat([result, payload]);
        break;
      case 'string': {
        if (
          suggested != null &&
          suggested !== DataType.STRING &&
          suggested !== DataType.TEXT
        ) {
          throw new Error(
            `String value cannot be converted to ${DataType[suggested]}`,
          );
        }

        const codeType = suggested ?? DataType.STRING;
        const string = Buffer.from(value as string, 'utf-8');
        const header = Buffer.alloc(5);

        header.writeUInt8(codeType);
        header.writeUint32BE(string.length, 1);
        result = Buffer.concat([result, header, string]);
        break;
      }
      case 'bigint':
        const bigint = Buffer.alloc(9);
        bigint.writeUint8(DataType.INT64);
        bigint.writeBigInt64BE(value as bigint, 1);
        result = Buffer.concat([result, bigint]);
        break;
      case 'object':
        switch (true) {
          case value instanceof Date:
            if (
              suggested != null &&
              suggested !== DataType.DATE &&
              suggested !== DataType.TIMESTAMP
            ) {
              throw new Error(
                `Date value cannot be converted to ${DataType[suggested]}`,
              );
            }
            const codeType = suggested ?? DataType.TIMESTAMP;
            const date = Buffer.alloc(codeType === DataType.DATE ? 5 : 9);

            date.writeUint8(codeType);

            if (codeType === DataType.DATE) {
              date.writeUint32BE(parseDateToInt(value), 1);
            } else {
              date.writeDoubleBE(value.getTime(), 1);
            }

            result = Buffer.concat([result, date]);
            break;
          case value instanceof Int64: {
            const header = Buffer.alloc(1);
            header.writeUint8(DataType.INT64);
            result = Buffer.concat([result, header, value.buffer]);
            break;
          }
          case value instanceof Buffer: {
            const header = Buffer.alloc(5);
            header.writeUInt8(DataType.BLOB);
            header.writeUint32BE(value.length, 1);
            result = Buffer.concat([result, header, value]);
            break;
          }
          default:
            throw new Error(
              `Value is a object but is is not instance of Buffer or Date or Int64`,
            );
        }
        break;
      default:
        throw new Error(`Unexpected value type ${type}`);
    }
  }
  return result;
}

function parseDateToInt(localDate: Date | null): number {
  if (!localDate) {
    throw new Error('Date expression is none or empty.');
  }

  const year = localDate.getFullYear();
  const month = localDate.getMonth() + 1; // Months are zero-indexed in JS
  const day = localDate.getDate();

  if (year < 1000 || year > 9999) {
    throw new Error('Year must be between 1000 and 9999.');
  }

  return year * 10000 + month * 100 + day;
}
