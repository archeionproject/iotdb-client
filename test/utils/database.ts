import { path as rootPath } from 'app-root-path';
import dockerCompose from 'docker-compose';

export async function timeseriesExists(path: string): Promise<boolean> {
  const { out } = await dockerCompose.exec(
    'iotdb',
    `start-cli.sh -h iotdb -e SHOW TIMESERIES ${path}`,
    {
      cwd: `${rootPath}/test`,
      log: false,
      env: process.env,
    },
  );

  return !out.includes('Empty set.');
}

export async function deleteAll(): Promise<void> {
  await dockerCompose.exec(
    'iotdb',
    'start-cli.sh -h iotdb -e DELETE DATABASE root.**',
    {
      cwd: `${rootPath}/test`,
      log: false,
      env: process.env,
    },
  );
}

export async function cliExec(sql: string): Promise<unknown> {
  return dockerCompose.exec(
    'iotdb',
    `start-cli.sh -h iotdb -e "${sql.replace(/"/g, '\\"')}"`,
    {
      cwd: `${rootPath}/test`,
      log: false,
      env: process.env,
    },
  );
}
