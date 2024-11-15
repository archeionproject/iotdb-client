import Int64 from 'node-int64';

import { DataType } from '../enums/data-type.enum';

export type ValueToDataType = {
  [DataType.BOOLEAN]: boolean;
  [DataType.INT32]: number;
  [DataType.INT64]: bigint | Int64 | number;
  [DataType.FLOAT]: number;
  [DataType.DOUBLE]: number;
  [DataType.TEXT]: string;
  [DataType.STRING]: string;
  [DataType.BLOB]: Buffer;
  [DataType.TIMESTAMP]: Date;
  [DataType.DATE]: Date;
};
