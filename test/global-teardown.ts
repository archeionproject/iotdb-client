import dockerCompose from 'docker-compose';
import isCI from 'is-ci';

import { deleteAll } from './utils/database';

export default async function (): Promise<void> {
  if (isCI) {
    dockerCompose.down();
  }

  console.log('Cleaning up iotdb');

  await deleteAll();
}
