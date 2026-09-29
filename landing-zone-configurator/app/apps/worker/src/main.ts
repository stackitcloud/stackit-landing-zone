// Deliberately fails closed until a durable queue and run authorization exist.
console.error(
  "Worker is not configured: durable queue and runner integration are pending.",
);
process.exitCode = 1;
