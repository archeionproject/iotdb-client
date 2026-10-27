import { Connection } from 'thrift';

import { Client } from '../generated/IClientRPCService';

// node-thrift neither settles the calls waiting for a response when their
// connection fails nor the ones made after it closed (it queues them until a
// reconnection that never happens), so both would wait forever. The proxy
// tracks the calls of the client and settles them on the connection events.
export function createClientProxy(
  connection: Connection,
  client: Client,
): Client {
  const pending = new Set<(error: Error) => void>();
  let lastError: Error | undefined;
  let closedError: Error | undefined;

  const failPending = (error: Error): void => {
    for (const reject of pending) {
      reject(error);
    }
    pending.clear();
  };

  connection.on('error', (error: Error) => {
    lastError = error;
    failPending(
      new Error(`IoTDB call failed: ${error.message}`, { cause: error }),
    );
  });
  connection.once('close', () => {
    closedError = new Error('IoTDB connection closed', { cause: lastError });
    failPending(closedError);
  });

  return new Proxy(client, {
    get(target, property, receiver): unknown {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== 'function') {
        return value;
      }

      return (...args: unknown[]): Promise<unknown> => {
        if (closedError != null) {
          return Promise.reject(closedError);
        }

        // Synchronous errors of the call become rejections as well
        const call = new Promise((resolve) =>
          resolve(value.apply(target, args)),
        );
        return new Promise((resolve, reject) => {
          pending.add(reject);
          call.then(resolve, reject).finally(() => pending.delete(reject));
        });
      };
    },
  });
}
