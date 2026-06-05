/**
 * Unified entry point.
 * Select checker via:
 *   - CLI arg:  npm run run -- --checker=centerparcs  (note the extra --)
 *   - npm flag: npm run run --checker=centerparcs     (sets npm_config_checker)
 *   - env var:  CHECKER=centerparcs npm run run
 * Valid values: "acv" (default), "centerparcs"
 */

import { main as runAcv } from "./check-availability.js";
import { main as runCenterparcs } from "./check-centerparcs.js";

const arg = process.argv.find((a) => a.startsWith("--checker="));
const checker = (
  arg?.split("=")[1] ??
  process.env.npm_config_checker ??
  process.env.CHECKER ??
  "acv"
).toLowerCase();

async function run(): Promise<void> {
  console.log(`Running checker: ${checker}`);
  if (checker === "acv") {
    await runAcv();
  } else if (checker === "centerparcs") {
    await runCenterparcs();
  } else {
    console.error(`Unknown checker: "${checker}". Valid values: acv, centerparcs`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
