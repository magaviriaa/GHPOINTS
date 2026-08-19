import "dotenv/config";
import { pruneExpiredAuthRows } from "../src/server/auth/prune";

async function main() {
  const removed = await pruneExpiredAuthRows();
  console.log(
    `Prune OK. Sesiones vencidas: ${removed.sessions}. Retos de login antiguos: ${removed.challenges}.`
  );
}

main();
