import { EventEmitter } from 'events';
import { Connection } from 'thrift';

import { Client } from '../../generated/IClientRPCService';
import { createClientProxy } from '../../src/thrift-client-proxy';

describe('createClientProxy', () => {
  let connection: EventEmitter;
  let call: jest.Mock;
  let client: Client;

  beforeEach(() => {
    connection = new EventEmitter();
    // Never answered, as a call waiting for a response
    call = jest.fn(() => new Promise(() => undefined));
    client = createClientProxy(
      connection as unknown as Connection,
      {
        requestStatementId: call,
      } as unknown as Client,
    );
  });

  it('should return the result of the call', async () => {
    call.mockResolvedValue(42);

    await expect(client.requestStatementId(1 as never)).resolves.toBe(42);
  });

  it('should reject the calls waiting when the connection closes', async () => {
    const result = client.requestStatementId(1 as never);

    connection.emit('close');

    await expect(result).rejects.toThrow('IoTDB connection closed');
  });

  it('should reject the calls made after the connection closed without sending them', async () => {
    connection.emit('close');

    await expect(client.requestStatementId(1 as never)).rejects.toThrow(
      'IoTDB connection closed',
    );
    expect(call).not.toHaveBeenCalled();
  });

  it('should reject the calls waiting on a connection error, with the error as cause', async () => {
    const error = new Error('read ECONNRESET');
    const result = client.requestStatementId(1 as never);

    connection.emit('error', error);

    await expect(result).rejects.toThrow('IoTDB call failed: read ECONNRESET');
    await expect(result).rejects.toHaveProperty('cause', error);
    // The connection is not closed, later calls are still sent
    client.requestStatementId(1 as never);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('should keep the error that closed the connection as cause', async () => {
    const error = new Error('read ECONNRESET');

    connection.emit('error', error);
    connection.emit('close');

    await expect(client.requestStatementId(1 as never)).rejects.toHaveProperty(
      'cause',
      error,
    );
  });

  it('should reject when the call throws', async () => {
    call.mockImplementation(() => {
      throw new Error('cannot write');
    });

    await expect(client.requestStatementId(1 as never)).rejects.toThrow(
      'cannot write',
    );
  });
});
