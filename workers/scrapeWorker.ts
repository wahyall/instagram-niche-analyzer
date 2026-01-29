import "dotenv/config";
import http from "http";
import { createScrapeWorker } from "../src/lib/queue/worker";
import { createAuthWorker } from "../src/lib/queue/authWorker";

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

console.log("Starting Instagram Workers...");

const scrapeWorker = createScrapeWorker();
const authWorker = createAuthWorker();

console.log("Auth Worker started and listening for login jobs...");
console.log("Scrape Worker started and listening for scrape jobs...");

// Handle graceful shutdown
process.on("SIGTERM", async () => {
  console.log("Received SIGTERM, closing workers...");
  server.close();
  await Promise.all([scrapeWorker.close(), authWorker.close()]);
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("Received SIGINT, closing workers...");
  server.close();
  await Promise.all([scrapeWorker.close(), authWorker.close()]);
  process.exit(0);
});
