import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createStore } from "./store.js";
import { seedDevAuth } from "./auth.js";
import { TaskQueue } from "./queue.js";
import { Scheduler } from "./scheduler.js";
import { QueueWorker } from "./queue-worker.js";
import { logger } from "@ghost/observability";

const config = loadConfig();
const store = createStore(config);

const devAuthSeed = seedDevAuth(config);
if (devAuthSeed) {
  logger.info({ email: devAuthSeed.email, user_id: devAuthSeed.userId }, "development auth seeded");
}

// Initialize background processing
const queue = new TaskQueue(store);
const scheduler = new Scheduler(store, queue);
const worker = new QueueWorker(store, queue);

// Start background services
scheduler.start();
worker.start();

// Initialize API
const app = createApp(config, store);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, `Ghost API listening on http://localhost:${config.port}`);
});

server.on("error", (err: any) => {
  if (err.code === "EADDRINUSE") {
    logger.error({ port: config.port }, `Port ${config.port} is already in use. Please terminate existing instances.`);
  } else {
    logger.error({ err }, "Server encountered an error");
  }
  process.exit(1);
});
