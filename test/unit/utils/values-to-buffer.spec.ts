import Int64 from 'node-int64';

import { DataType } from '../../../src/enums';
import { valuesToBuffer } from '../../../src/utils';
import {
  binaryBuffer,
  booleanBuffer,
  floatBuffer,
  int32Buffer,
  int64Buffer,
  textBuffer,
} from '../../utils/query-data-set';

// Each value is sent as its type code followed by its encoding
function typedValue(type: DataType, value: Buffer): Buffer {
  return Buffer.concat([Buffer.from([type]), value]);
}

describe('valuesToBuffer', () => {
  it('should convert boolean value to buffer with DataType.BOOLEAN code', () => {
    const values = [true];
    const types = [DataType.BOOLEAN];
    const result = valuesToBuffer(values, types);
    expect(result).toEqual(typedValue(DataType.BOOLEAN, booleanBuffer(true)));
  });

  it('should throw error for mismatched array lengths', () => {
    const values = [true, 42];
    const types = [DataType.BOOLEAN];
    expect(() => valuesToBuffer(values, types)).toThrow(
      'When declaring value type the length of the two arrays should match',
    );
  });

  it('should convert number to INT32 if suggested type is INT32', () => {
    const values = [42];
    const types = [DataType.INT32];
    const result = valuesToBuffer(values, types);
    expect(result).toEqual(typedValue(DataType.INT32, int32Buffer(42)));
  });

  it('should convert number to INT64 if suggested type is INT64', () => {
    const values = [-42];
    const types = [DataType.INT64];
    const result = valuesToBuffer(values, types);
    expect(result).toEqual(typedValue(DataType.INT64, int64Buffer(-42)));
  });

  it('should throw error for non integer number with INT64 type', () => {
    const values = [4.2];
    const types = [DataType.INT64];
    expect(() => valuesToBuffer(values, types)).toThrow(
      'cannot be converted to a BigInt because it is not an integer',
    );
  });

  it('should convert number to FLOAT by default if no type specified', () => {
    const values = [3.14];
    const result = valuesToBuffer(values);
    expect(result).toEqual(typedValue(DataType.FLOAT, floatBuffer(3.14)));
  });

  it('should throw error for number with incompatible type (e.g., TEXT)', () => {
    const values = [42];
    const types = [DataType.TEXT];
    expect(() => valuesToBuffer(values, types)).toThrow(
      'Number value cannot be converted to TEXT',
    );
  });

  it('should convert string to STRING with correct length', () => {
    const values = ['hello'];
    const types = [DataType.STRING];
    const result = valuesToBuffer(values, types);
    expect(result).toEqual(typedValue(DataType.STRING, textBuffer('hello')));
  });

  it('should throw error for string with incompatible type (e.g., BOOLEAN)', () => {
    const values = ['test'];
    const types = [DataType.BOOLEAN];
    expect(() => valuesToBuffer(values, types)).toThrow(
      'String value cannot be converted to BOOLEAN',
    );
  });

  it('should handle bigint as INT64', () => {
    const values = [BigInt(123456789012345)];
    const result = valuesToBuffer(values);
    expect(result).toEqual(
      typedValue(DataType.INT64, int64Buffer(BigInt(123456789012345))),
    );
  });

  it('should handle Date object with TIMESTAMP by default', () => {
    const date = new Date();
    const values = [date];
    const result = valuesToBuffer(values);
    expect(result.readUInt8(0)).toBe(DataType.TIMESTAMP);
    expect(result.readDoubleBE(1)).toBeCloseTo(date.getTime(), -1);
  });

  it('should handle Int64 as INT64', () => {
    const int64Value = new Int64(123456789);
    const values = [int64Value];
    const result = valuesToBuffer(values);
    expect(result).toEqual(typedValue(DataType.INT64, int64Buffer(123456789)));
  });

  it('should handle Buffer as BLOB with correct length', () => {
    const bufferValue = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const values = [bufferValue];
    const result = valuesToBuffer(values);
    expect(result).toEqual(
      typedValue(DataType.BLOB, binaryBuffer(bufferValue)),
    );
  });

  it('should throw error for mismatched types in array', () => {
    const values = [true];
    const types = [DataType.INT32];
    expect(() => valuesToBuffer(values, types)).toThrow(
      'Boolean value cannot be converted to INT32',
    );
  });
  it('should throw error if an unexpected value type is encountered', () => {
    const values: any[] = [Symbol('unexpectedSymbol')];
    const types = [DataType.INT32]; // Expecting a number, but passing a symbol

    expect(() => valuesToBuffer(values, types)).toThrow(
      'Unexpected value type',
    );
  });

  it('should throw error if an empty object is passed', () => {
    const values: any[] = [{}];
    const types = [DataType.STRING];

    expect(() => valuesToBuffer(values, types)).toThrow(
      'Value is a object but is is not instance of Buffer or Date or Int64',
    );
  });

  it('should throw error if a function is passed', () => {
    const values: any[] = [(): void => {}];
    const types = [DataType.BOOLEAN];

    expect(() => valuesToBuffer(values, types)).toThrow(
      'Unexpected value type',
    );
  });

  it('should throw error if null is passed without types', () => {
    const values: any[] = [null];
    const types: DataType[] = [];

    expect(() => valuesToBuffer(values, types)).toThrow(
      'Value is a object but is is not instance of Buffer or Date or Int64',
    );
  });

  it('should throw error if undefined is passed without types', () => {
    const values: any[] = [undefined];
    const types: DataType[] = [];

    expect(() => valuesToBuffer(values, types)).toThrow(
      'Unexpected value type',
    );
  });

  it('should throw error if a special case type is encountered', () => {
    // Pass an unexpected type in the switch (for example a Set)
    const values: any[] = [new Set([1, 2, 3])];
    const types = [DataType.BLOB]; // Set is not handled in the function

    expect(() => valuesToBuffer(values, types)).toThrow(
      'Value is a object but is is not instance of Buffer or Date or Int64',
    );
  });

  it('should throw error if the suggested type is not handled', () => {
    const values: any[] = [Symbol('example')];
    const types = [DataType.BOOLEAN];

    expect(() => valuesToBuffer(values, types)).toThrow(
      'Unexpected value type',
    );
  });
});
