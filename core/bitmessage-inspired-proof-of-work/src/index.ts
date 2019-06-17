import * as sodium from "libsodium-wrappers";

interface BitmessageInspiredProofOfWork {
  proofOfWork(payload: string, timeToLive: bigint): bigint;
  verify(payload: string, timeToLive: bigint, nonce: bigint): boolean;
}

const instantiate = async (): Promise<BitmessageInspiredProofOfWork> => {
  await sodium.ready;

  const genericHash = (payload: string): string =>
    sodium.crypto_generichash(
      sodium.crypto_generichash_BYTES,
      payload,
      undefined,
      "base64"
    );

  const salt = new Uint8Array(sodium.crypto_pwhash_SALTBYTES);

  const hash = (payload: string): bigint => {
    const result = sodium.crypto_pwhash(
      sodium.crypto_pwhash_BYTES_MIN,
      payload,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_MIN,
      sodium.crypto_pwhash_MEMLIMIT_MIN,
      sodium.crypto_pwhash_ALG_DEFAULT
    );
    return (
      BigInt(result[0]) * 256n ** 7n +
      BigInt(result[1]) * 256n ** 6n +
      BigInt(result[2]) * 256n ** 5n +
      BigInt(result[3]) * 256n ** 4n +
      BigInt(result[4]) * 256n ** 3n +
      BigInt(result[5]) * 256n ** 2n +
      BigInt(result[6]) * 256n ** 1n +
      BigInt(result[7]) * 256n ** 0n
    );
  };

  const calculateTarget = (
    payloadLength: bigint,
    timeToLive: bigint
  ): bigint => {
    const NONCE_TRIALS_PER_BYTE = 1n;
    const PAYLOAD_LENGTH_EXTRA_BYTES = 1000n;

    const target =
      2n ** 64n /
      (NONCE_TRIALS_PER_BYTE *
        (payloadLength +
          PAYLOAD_LENGTH_EXTRA_BYTES +
          (timeToLive * (payloadLength + PAYLOAD_LENGTH_EXTRA_BYTES)) /
            2n ** 16n));

    return target;
  };

  const proofOfWork = (payload: string, timeToLive: bigint): bigint => {
    const initialHash = genericHash(payload);

    let nonce = 0n;
    let trialValue = 2n ** 64n;

    const target = calculateTarget(BigInt(payload.length), timeToLive);

    while (trialValue > target) {
      nonce++;
      trialValue = hash(nonce + initialHash);
    }

    return nonce;
  };

  const verify = (
    payload: string,
    timeToLive: bigint,
    nonce: bigint
  ): boolean => {
    const target = calculateTarget(BigInt(payload.length), timeToLive);
    const initialHash = genericHash(payload);
    return hash(nonce + initialHash) <= target;
  };

  return { proofOfWork, verify };
};

export default instantiate;
