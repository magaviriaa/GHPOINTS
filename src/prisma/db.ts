import "dotenv/config";
import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "./contract.d";
import contractJson from "./contract.json" with { type: "json" };

function createDb() {
  return postgres<Contract>({
    contractJson,
    url: process.env["DATABASE_URL"],
  });
}

// SAFETY: Next HMR re-evaluates this module; the client must stay a process singleton.
const globalForDb = globalThis as typeof globalThis & {
  prismaDb?: ReturnType<typeof createDb>;
};

export const db = globalForDb.prismaDb ?? createDb();

if (process.env.NODE_ENV !== "production") {
  globalForDb.prismaDb = db;
}

export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
