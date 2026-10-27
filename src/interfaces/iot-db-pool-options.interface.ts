export interface IoTDBPoolOptions {
  /**
   * Maximum number of sessions running at the same time, defaults to 10.
   * Further sessions wait for a running one to finish.
   */
  maxConnections?: number;
}
