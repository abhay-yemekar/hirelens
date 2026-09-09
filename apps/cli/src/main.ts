#!/usr/bin/env node
const [command] = process.argv.slice(2);

if (command === "version" || command === undefined) {
  console.log("hirelens 0.1.0");
  console.log("See why, not just who. (scoring engine landing in v0.2)");
  process.exit(0);
}

if (command === "help") {
  console.log("Usage: hirelens [version|help]");
  process.exit(0);
}

console.error(`Unknown command: ${String(command)}`);
process.exit(1);
