import { TSStatus } from '../../generated/common_types';

export function formatTSStatusError(status: TSStatus): string {
  const formatSubStatus = (subStatuses?: TSStatus[]): string => {
    if (!subStatuses || subStatuses.length === 0) {
      return '';
    }
    return subStatuses
      .map(
        (sub, index) =>
          `  SubStatus ${index + 1}:\n${formatTSStatusError(sub)}`,
      )
      .join('\n');
  };

  return (
    `Error Code: ${status.code}\n` +
    (status.message ? `Message: ${status.message}\n` : '') +
    (status.needRetry ? 'Retry is required.\n' : '') +
    formatSubStatus(status.subStatus)
  );
}

export class IoTDBError extends Error {
  public code: number;
  public subStatus: TSStatus[] | undefined;
  public needRetry: boolean | undefined;

  public constructor(status: TSStatus) {
    super(formatTSStatusError(status));
    this.name = 'IoTDBError';
    this.code = status.code;
    this.subStatus = status.subStatus;
    this.needRetry = status.needRetry;
  }
}
