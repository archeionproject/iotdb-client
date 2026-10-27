# IoTDB Client for Node.js

This is a modern **Node.js client library for IoTDB**, inspired by popular database clients like Prisma and InfluxDB. It aims to provide an intuitive, type-safe interface for interacting with IoTDB using modern JavaScript/TypeScript idioms.

**⚠️ Status: Early Preview**
This library is in its **early development stages**. The API is subject to change, and many features are yet to be implemented. Contributions, suggestions, and bug reports are welcome as we evolve the library.

---

## Features

- **TypeScript-first**: Type-safe queries and operations.
- **Session Management**: Automatic session handling for convenience and reliability.
- **Flexible Operations**: Create, delete, and update time series and measurements.
- **Inspired Design**: Built with a Prisma and InfluxDB-like approach.

---

## Installation

```bash
npm install iotdb-client
```

---

## Usage Example

Here’s a basic example demonstrating how to create a client, connect to IoTDB, and perform simple operations:

```typescript
import { IoTDBClient, DataType } from 'iotdb-client';

async function main() {
  // Create a new client instance
  const client = new IoTDBClient('127.0.0.1', 6667, {
    username: 'root',
    password: 'root',
  });

  try {
    // Connect to the IoTDB server
    await client.$connect();
    console.log('Connected to IoTDB.');

    // Create a time series - creates a temporary session and closes it
    await client.createTimeSeries(
      'root.vehicle.d0.s0',
      DataType.INT32,
      { description: 'Temperature sensor' },
    );
    console.log('Time series created.');

    // Insert a measurement - creates a temporary session and closes it
    await client.insertMeasurement(
      'root.vehicle.d0',
      's0',
      new Date(),
      25,
      DataType.INT32,
    );
    console.log('Measurement inserted.');

    // Perform custom session operations
    await client.$session(async (session) => {
      console.log('Session started.');
      
      const queryResult = await session.rawQuery(
        'SELECT * FROM root.vehicle.d0',
      );

      for await (result of queryResult.next()){
        // Print the result:
        console.log(result)
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Disconnect from the server
    await client.$disconnect();
    console.log('Disconnected from IoTDB.');
  }
}

main().catch((err) => console.error('Unexpected Error:', err));
```

---

## API Highlights

### Client Initialization

```typescript
const client = new IoTDBClient(host, port, { username, password, zoneId, maxConnections });
```

- `host`: Hostname or IP address of the IoTDB server.
- `port`: Port number (default: 6667).
- `options`: Optional settings like username, password, time zone, and connection pool size. IoTDB binds a session to its connection, so each session running at the same time uses its own connection; connections are reused once their session is closed. `maxConnections` caps how many sessions run at once (default: 10), further sessions wait for a running one to finish.

---

### Core Methods

#### `$connect()`
Optional, sessions connect on demand. Opens and closes a session to check that the server is reachable and the credentials are valid, so the application can fail fast at startup.

#### `$disconnect()`
Close all the connections. Later calls connect again on demand.

#### `createTimeSeries(path, type, tags?, encoding?, compression?)`
Creates a time series with the specified properties.

#### `insertMeasurement(path, measurement, time, value, type?)`
Insert a single measurement into a time series.

#### `insertMeasurements(path, measurements, time, values, types?)`
Insert multiple measurements into a time series.

#### `$session(callback)`
Run operations within a managed session.


