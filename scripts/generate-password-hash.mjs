import { pbkdf2Sync, randomBytes } from "node:crypto";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
if (password.length < 12) {
  console.error("Password must contain at least 12 characters.");
  process.exitCode = 1;
} else {
  const iterations = 100_000;
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, iterations, 32, "sha256");
  const encode = (value) => value.toString("base64url");
  process.stdout.write(`pbkdf2_sha256$${iterations}$${encode(salt)}$${encode(hash)}\n`);
}
