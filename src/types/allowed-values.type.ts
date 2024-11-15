import { DataType } from '../enums';
import { ValueToDataType } from './value-to-data-type.type';

export type AllowedValues<T extends DataType> = ValueToDataType[T];
