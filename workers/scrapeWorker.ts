import "dotenv/config";
import { createScrapeWorker } from "../src/lib/queue/worker";

console.log("Starting Instagram Scrape Worker...");

const worker = createScrapeWorker();

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, closing worker...");
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, closing worker...");
  await worker.close();
  process.exit(0);
});

console.log("Worker started and listening for jobs...");
