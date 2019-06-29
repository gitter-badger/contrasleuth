import * as sodium from "libsodium-wrappers";
import JSBI from "jsbi";

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

interface BitmessageInspiredProofOfWorkCompat {
  proofOfWork(payload: string, timeToLive: JSBI): JSBI;
  verify(payload: string, timeToLive: JSBI, nonce: JSBI): boolean;
}

const instantiateCompat = async (): Promise<
  BitmessageInspiredProofOfWorkCompat
> => {
  await sodium.ready;

  const genericHash = (payload: string): string =>
    sodium.crypto_generichash(
      sodium.crypto_generichash_BYTES,
      payload,
      undefined,
      "base64"
    );

  const salt = new Uint8Array(sodium.crypto_pwhash_SALTBYTES);

  const hash = (payload: string): JSBI => {
    const result = sodium.crypto_pwhash(
      sodium.crypto_pwhash_BYTES_MIN,
      payload,
      salt,
      sodium.crypto_pwhash_OPSLIMIT_MIN,
      sodium.crypto_pwhash_MEMLIMIT_MIN,
      sodium.crypto_pwhash_ALG_DEFAULT
    );

    const _256 = JSBI.BigInt(256);
    const _0 = JSBI.BigInt(0);
    const _1 = JSBI.BigInt(1);
    const _2 = JSBI.BigInt(2);
    const _3 = JSBI.BigInt(3);
    const _4 = JSBI.BigInt(4);
    const _5 = JSBI.BigInt(5);
    const _6 = JSBI.BigInt(6);
    const _7 = JSBI.BigInt(7);

    return JSBI.add(
      JSBI.exponentiate(JSBI.multiply(JSBI.BigInt(result[0]), _256), _7),
      JSBI.add(
        JSBI.exponentiate(JSBI.multiply(JSBI.BigInt(result[1]), _256), _6),
        JSBI.add(
          JSBI.exponentiate(JSBI.multiply(JSBI.BigInt(result[2]), _256), _5),
          JSBI.add(
            JSBI.exponentiate(JSBI.multiply(JSBI.BigInt(result[3]), _256), _4),
            JSBI.add(
              JSBI.exponentiate(
                JSBI.multiply(JSBI.BigInt(result[4]), _256),
                _3
              ),
              JSBI.add(
                JSBI.exponentiate(
                  JSBI.multiply(JSBI.BigInt(result[5]), _256),
                  _2
                ),
                JSBI.add(
                  JSBI.exponentiate(
                    JSBI.multiply(JSBI.BigInt(result[6]), _256),
                    _1
                  ),
                  JSBI.BigInt(result[7])
                )
              )
            )
          )
        )
      )
    );
  };

  const calculateTarget = (payloadLength: JSBI, timeToLive: JSBI): JSBI => {
    const NONCE_TRIALS_PER_BYTE = JSBI.BigInt(1);
    const PAYLOAD_LENGTH_EXTRA_BYTES = JSBI.BigInt(1000);

    const target = JSBI.divide(
      JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(64)),
      JSBI.multiply(
        NONCE_TRIALS_PER_BYTE,
        JSBI.add(
          payloadLength,
          JSBI.add(
            PAYLOAD_LENGTH_EXTRA_BYTES,
            JSBI.divide(
              JSBI.multiply(
                timeToLive,
                JSBI.add(payloadLength, PAYLOAD_LENGTH_EXTRA_BYTES)
              ),
              JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(16))
            )
          )
        )
      )
    );

    return target;
  };

  const proofOfWork = (payload: string, timeToLive: JSBI): JSBI => {
    const initialHash = genericHash(payload);

    const _1 = JSBI.BigInt(1);

    let nonce = JSBI.BigInt(0);
    let trialValue = JSBI.exponentiate(JSBI.BigInt(2), JSBI.BigInt(64));

    const target = calculateTarget(JSBI.BigInt(payload.length), timeToLive);

    while (JSBI.greaterThan(trialValue, target)) {
      nonce = JSBI.add(nonce, _1);
      trialValue = hash(JSBI.ADD(nonce, initialHash));
    }

    return nonce;
  };

  const verify = (payload: string, timeToLive: JSBI, nonce: JSBI): boolean => {
    const target = calculateTarget(JSBI.BigInt(payload.length), timeToLive);
    const initialHash = genericHash(payload);
    return JSBI.lessThan(hash(JSBI.ADD(nonce, initialHash)), target);
  };

  return { proofOfWork, verify };
};

export { instantiateCompat };
