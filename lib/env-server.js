import fs from "fs";
import path from "path";
import dotenv from "dotenv";

let didLoad = false;

export function ensureServerEnv() {
  if (didLoad) return;
  didLoad = true;

  // Your key is provided in `local.env` (per your setup). Next.js won't load it automatically,
  // so we load it here for server routes.
  const localEnvPath = path.join(process.cwd(), "local.env");
  if (fs.existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
  }
}

