import "dotenv/config";
import http from "http";
import { createScrapeWorker } from "../src/lib/queue/worker";

// Health check server for Railway
const PORT = process.env.PORT || 3001;
const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
});

console.log("Starting Instagram Scrape Worker...");

const worker = createScrapeWorker();

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, closing worker...");
  server.close();
  await worker.close();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, closing worker...");
  server.close();
  await worker.close();
  process.exit(0);
});

console.log("Worker started and listening for jobs...");
