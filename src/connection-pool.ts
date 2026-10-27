import {
  Connection,
  TFramedTransport,
  createClient,
  createConnection,
} from 'thrift';

import { Client } from '../generated/IClientRPCService';

export interface PooledConnection {
  connection: Connection;
  client: Client;
}

export class ConnectionPool {
  private connections = new Set<PooledConnection>();
  private idle: PooledConnection[] = [];
  // Connections leased or being opened
  private leased = 0;
  private waiting: (() => void)[] = [];

  public get connected(): boolean {
    return [...this.connections].some(({ connection }) => connection.connected);
  }

  public constructor(
    private host: string,
    private port: number,
    private maxConnections = 10,
  ) {}

  public async acquire(): Promise<PooledConnection> {
    if (this.leased < this.maxConnections) {
      this.leased++;
    } else {
      // The slot is handed over by the caller that releases it
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }

    const idle = this.idle.pop();
    if (idle != null) {
      return idle;
    }

    try {
      return await this.openConnection();
    } catch (error) {
      this.releaseSlot();
      throw error;
    }
  }

  public release(pooled: PooledConnection): void {
    // Connections closed in the meantime are not reused
    if (this.connections.has(pooled)) {
      this.idle.push(pooled);
    }
    this.releaseSlot();
  }

  // Calls still running on the closed connections fail
  public async disconnect(): Promise<void> {
    await Promise.all(
      [...this.connections].map(
        ({ connection }) =>
          new Promise<void>((resolve) => {
            connection.once('close', () => resolve());
            connection.destroy();
          }),
      ),
    );
  }

  private releaseSlot(): void {
    const next = this.waiting.shift();
    if (next != null) {
      next();
    } else {
      this.leased--;
    }
  }

  private openConnection(): Promise<PooledConnection> {
    const connection = createConnection(this.host, this.port, {
      transport: TFramedTransport,
    });
    const pooled = { connection, client: createClient(Client, connection) };

    return new Promise((resolve, reject) => {
      connection.once('error', reject);
      connection.once('connect', () => {
        connection.off('error', reject);
        // Catch any protocol error and destroy the connection
        connection.on('error', () => connection.destroy());
        connection.once('close', () => {
          this.connections.delete(pooled);
          this.idle = this.idle.filter((idle) => idle !== pooled);
        });
        this.connections.add(pooled);
        resolve(pooled);
      });
    });
  }
}
