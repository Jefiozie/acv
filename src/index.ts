/**
 * Unified entry point.
 * Select checker via CHECKER env var or --checker=<name> CLI arg.
 * Valid values: "acv" (default), "centerparcs"
 */

import { main as runAcv } from "./check-availability.js";
import { main as runCenterparcs } from "./check-centerparcs.js";

const arg = process.argv.find((a) => a.startsWith("--checker="));
const checker = (arg?.split("=")[1] ?? process.env.CHECKER ?? "acv").toLowerCase();

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
