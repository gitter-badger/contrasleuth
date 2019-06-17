import instantiatePoW from "bitmessage-inspired-proof-of-work";
import { parentPort, MessagePort } from "worker_threads";

if (parentPort === null) {
  throw new Error("This should only be run as a worker.");
} else {
  (parentPort as MessagePort).once(
    "message",
    async ({ payload, timeToLive }): Promise<void> => {
      const { proofOfWork } = await instantiatePoW();
      (parentPort as MessagePort).postMessage(proofOfWork(payload, timeToLive));
    }
  );
}
