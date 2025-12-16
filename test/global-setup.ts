import { path as rootPath } from 'app-root-path';
import axios from 'axios';
import { detectPort } from 'detect-port';
import dockerCompose from 'docker-compose';
import { setTimeout } from 'timers/promises';

export default async function (): Promise<void> {
  console.time('global-setup');
  console.log('\n');

  await startTimeseriesDatabase();

  console.timeEnd('global-setup');
  console.log();
}

async function startTimeseriesDatabase(): Promise<void> {
  const iotDBPort = 6667;
  // Speed up during development, if already live then do nothing
  const reachablePort = await detectPort(iotDBPort);
  if (reachablePort !== iotDBPort) {
    console.warn(`There is already a service listening on port ${iotDBPort}`);
    console.warn('Skipping the IoTDB configuration phase');
    return;
  }

  await dockerCompose.upOne('iotdb', {
    cwd: `${rootPath}/test`,
    log: true,
    env: process.env,
  });

  const iotDBRestEndpoint = `http://127.0.0.1:18080/ping`;
  let up = false;
  let retries = 0;
  while (up === false && retries < 25) {
    try {
      const { status } = await axios.get(iotDBRestEndpoint);

      if (status === 200) {
        up = true;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_error) {}
    await setTimeout(1000);
    retries++;
  }

  if (retries >= 25) {
    throw new Error('Timeout in waiting for IoTDB ' + iotDBRestEndpoint);
  }

  console.log('IoTDB is ready');
}
