import "dotenv/config";
import { pruneExpiredAuthRows } from "../src/server/auth/prune";
import { db } from "../src/prisma/db";

async function main() {
  const removed = await pruneExpiredAuthRows();
  console.log(
    `Prune OK. Sesiones vencidas: ${removed.sessions}. Retos de login antiguos: ${removed.challenges}.`
  );
  await db.close();
}

main();
