import { crypto_generichash } from "libsodium-wrappers";
import base32 from "hi-base32";

export const calculateIdentityHash = (
  publicSigningKey: number[],
  publicEncryptionKey: number[]
) =>
  base32
    .encode(
      crypto_generichash(
        10,
        new Uint8Array([...publicSigningKey, ...publicEncryptionKey])
      )
    )
    .toLowerCase();

// To break compatibility with any application using a similar encoding
// scheme.
const CHECKSUM_NAMESPACE = [64, 224, 177, 118];

export const stringifyBinary = (binary: number[]): string => {
  const base32Encoded = base32
    .encode([
      ...binary,
      ...Array.from(
        crypto_generichash(
          4,
          new Uint8Array([...CHECKSUM_NAMESPACE, ...binary])
        )
      )
    ])
    .replace(/=/g, "");
  const spaceEverySixCharacters = (base32Encoded.match(
    /....../g
  ) as RegExpMatchArray).join(" ");
  const residue = base32Encoded.replace(/....../g, "");
  return spaceEverySixCharacters + " " + residue;
};

export const parseBinary = (stringified: string): number[] | undefined => {
  let amalgamation: number[] | undefined;
  try {
    amalgamation = base32.decode.asBytes(
      stringified
        .split(" ")
        .join("")
        .toUpperCase()
    );
  } catch {
    return undefined;
  }
  const size = amalgamation.length;
  const binary = amalgamation.slice(0, size - 4);
  const checksum = amalgamation.slice(size - 4, size);
  const expectedChecksum = crypto_generichash(
    4,
    new Uint8Array([...CHECKSUM_NAMESPACE, ...binary])
  );
  const isValid =
    expectedChecksum.length === checksum.length &&
    expectedChecksum.every((element, index) => element === checksum[index]);
  if (!isValid) return undefined;
  return binary;
};
