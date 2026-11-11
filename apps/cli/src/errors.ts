/**
 * Stopping a command with an error message. fail() prints the message and
 * throws CliExit; main() recognizes CliExit and prints nothing more.
 */

/** Thrown by fail() after it has printed its message. */
export class CliExit extends Error {
  constructor() {
    super("command stopped after an error");
    this.name = "CliExit";
  }
}

export function fail(message: string): never {
  console.error(`error: ${message}`);
  // Let stdio flush before the process ends (Windows libuv assertion
  // otherwise fires when open sockets race the exit).
  setImmediate(() => process.exit(1));
  process.exitCode = 1;
  throw new CliExit();
}
