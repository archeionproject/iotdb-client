import { Session } from '../../src/session';
import { getClient } from '../utils/services';

describe('Session lifecycle', () => {
  const client = getClient();

  beforeEach(async () => {
    await client.$connect();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await client.$disconnect();
  });

  it('should create a session and close it', async () => {
    const openSpy = jest.spyOn(Session.prototype, 'open');
    const closeSpy = jest.spyOn(Session.prototype, 'close');
    const callback = jest.fn();

    await client.$session(callback);

    expect(openSpy).toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
    expect(callback).toHaveBeenCalled();
  });

  it('should manage multiple async sessions', async () => {
    const openSpy = jest.spyOn(Session.prototype, 'open');
    const closeSpy = jest.spyOn(Session.prototype, 'close');
    const callback = jest.fn();

    await Promise.all(
      Array.from({ length: 10 }, () => client.$session(callback)),
    );

    expect(openSpy).toHaveBeenCalledTimes(10);
    expect(closeSpy).toHaveBeenCalledTimes(10);
    expect(callback).toHaveBeenCalledTimes(10);
  });

  it('should reconnect if client was disconnected', async () => {
    const callback = jest.fn();

    await client.$session(callback);

    expect(callback).toHaveBeenCalled();
    callback.mockClear();

    const connection = client['connection']!;
    connection.connected = false;
    const $connectSpy = jest.spyOn(client, '$connect');

    await client.$session(callback);

    // restore and clean up old connection
    connection.connected = true;
    connection.destroy();

    expect(callback).toHaveBeenCalled();
    expect($connectSpy).toHaveBeenCalled();
  });
});
