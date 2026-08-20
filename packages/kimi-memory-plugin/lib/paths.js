import { homedir } from "node:os";
import { join } from "node:path";

export function kimiHome(env = process.env) {
  return env.KIMI_CODE_HOME || join(homedir(), ".kimi-code");
}

export function memoryDatabasePath(env = process.env) {
  return env.KIMI_MEMORY_DB || join(kimiHome(env), "memory-plus", "memory.db");
}
