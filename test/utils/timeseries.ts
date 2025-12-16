export function randomTimeSeriesPath(): string {
  return `${randomTimeSeries()}.${randomProperty()}`;
}

export function randomTimeSeries(): string {
  const randomDevice = Math.random().toString(36).substring(2, 9);
  return `root.testdatabase.${randomDevice}`;
}

export function randomProperty(): string {
  return Math.random().toString(36).substring(2, 9);
}

export function randomMeasurement(): string {
  return Math.random().toString(36).substring(2, 8);
}
