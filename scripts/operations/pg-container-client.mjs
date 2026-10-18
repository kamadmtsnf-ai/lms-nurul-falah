// Use official PostgreSQL 17 clients without relying on the runner's apt repositories.
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
const [tool, ...args] = process.argv.slice(2);
if (!["psql", "pg_dump", "pg_restore"].includes(tool))
  throw new Error("Client PostgreSQL tidak diizinkan.");
let output, input;
const index = args.indexOf("--file");
if (tool === "pg_dump" && index >= 0) {
  output = args[index + 1];
  if (!output) throw new Error("Path dump tidak valid.");
  args.splice(index, 2);
}
if (tool === "pg_restore" && args.at(-1) && !args.at(-1).startsWith("-")) {
  input = args.pop();
}
const variables = [
  "PGHOST",
  "PGPORT",
  "PGDATABASE",
  "PGUSER",
  "PGPASSWORD",
  "PGSSLMODE",
  "PGSSLROOTCERT",
].flatMap((k) => ["-e", k]);
const invocation = process.env.LMS_PG_CONTAINER
  ? ["exec", "-i", ...variables, process.env.LMS_PG_CONTAINER, tool, ...args]
  : [
      "run",
      "--rm",
      "-i",
      "--network",
      "host",
      ...variables,
      "postgres:17",
      tool,
      ...args,
    ];
const child = spawn("docker", invocation, { stdio: ["pipe", "pipe", "pipe"] });
child.stderr.resume();
child.stdin.on("error", () => {});
try {
  const ended = new Promise((resolve, reject) => {
    child.on("error", () => reject(new Error("Docker client tidak tersedia.")));
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error("Client PostgreSQL gagal.")),
    );
  });
  const transfer = output
    ? pipeline(child.stdout, createWriteStream(output, { mode: 0o600 }))
    : pipeline(child.stdout, process.stdout, { end: false });
  if (input)
    createReadStream(input)
      .on("error", () => child.kill())
      .pipe(child.stdin);
  else process.stdin.pipe(child.stdin);
  await Promise.all([ended, transfer]);
} catch {
  child.kill();
  console.error(
    "Operasi PostgreSQL container gagal; kredensial dan log mentah tidak dicetak.",
  );
  process.exitCode = 1;
}
