export interface ContrasleuthKeyPair {
  type: "key pair";
  publicSigningKey: number[];
  privateSigningKey: number[];
  publicEncryptionKey: number[];
  privateEncryptionKey: number[];
}

export interface ContrasleuthIdentity {
  name: string;
  keyPair: ContrasleuthKeyPair;
}

export interface ContrasleuthSymmetricKey {
  type: "symmetric key";
  key: number[];
}

export type ContrasleuthKey = ContrasleuthKeyPair | ContrasleuthSymmetricKey;

export interface ContrasleuthSignedPublicHalf {
  publicSigningKey: number[];
  publicEncryptionKey: number[];
  publicEncryptionKeySignature: number[];
}

export interface ContrasleuthPublicHalf {
  publicSigningKey: number[];
  publicEncryptionKey: number[];
}

export interface ContrasleuthUnmoderatedGroup {
  name: string;
  key: ContrasleuthSymmetricKey;
}

export type ContrasleuthRecipient =
  | {
      type: "unmoderated group";
      data: ContrasleuthUnmoderatedGroup;
    }
  | {
      type: "public half";
      data: ContrasleuthPublicHalf;
    };

export interface ContrasleuthSignedMessage {
  recipientDigest: number[];
  publicHalf: ContrasleuthSignedPublicHalf;
  message: string;
  signature: number[];
}

export interface ContrasleuthMessage {
  recipient: ContrasleuthRecipient;
  publicHalf: ContrasleuthPublicHalf;
  message: string;
  signatureHash: number[];
}
