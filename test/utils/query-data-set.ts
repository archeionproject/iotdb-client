export function int32Buffer(...values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => buffer.writeInt32BE(value, i * 4));
  return buffer;
}

export function int64Buffer(...values: (number | bigint)[]): Buffer {
  const buffer = Buffer.alloc(values.length * 8);
  values.forEach((value, i) => buffer.writeBigInt64BE(BigInt(value), i * 8));
  return buffer;
}

export function floatBuffer(...values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  values.forEach((value, i) => buffer.writeFloatBE(value, i * 4));
  return buffer;
}

export function doubleBuffer(...values: number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 8);
  values.forEach((value, i) => buffer.writeDoubleBE(value, i * 8));
  return buffer;
}

export function booleanBuffer(...values: boolean[]): Buffer {
  return Buffer.from(values.map((value) => (value ? 1 : 0)));
}

// Each value is prefixed by its length as a 4 bytes integer
export function binaryBuffer(...values: Buffer[]): Buffer {
  return Buffer.concat(
    values.flatMap((value) => [int32Buffer(value.length), value]),
  );
}

export function textBuffer(...values: string[]): Buffer {
  return binaryBuffer(...values.map((value) => Buffer.from(value, 'utf-8')));
}

// One bit per row, most significant bit first; a set bit means the row has a value
export function bitmap(...present: boolean[]): Buffer {
  const buffer = Buffer.alloc(Math.ceil(present.length / 8));
  present.forEach((p, i) => {
    if (p) {
      buffer[Math.floor(i / 8)] |= 1 << (7 - (i % 8));
    }
  });
  return buffer;
}

export function allPresent(rows: number): Buffer {
  return bitmap(...new Array<boolean>(rows).fill(true));
}
