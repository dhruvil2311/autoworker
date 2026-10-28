import * as dotenv from "dotenv";
dotenv.config({ path: ".env" });
import { runQueuedWorkflow } from "../apps/worker/src/worker.js";

async function test() {
  console.log("Testing runQueuedWorkflow for 6927a63c-0aa3-4a11-b206-66b9b9844e70...");
  try {
    await runQueuedWorkflow("6927a63c-0aa3-4a11-b206-66b9b9844e70");
    console.log("Completed runQueuedWorkflow!");
  } catch (e) {
    console.error("Error in runQueuedWorkflow:", e);
  }
}

test();
