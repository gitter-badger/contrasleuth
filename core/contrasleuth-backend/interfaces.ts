import { ObservableSet, IObservableObject } from "mobx";

export interface ContrasleuthKeyPair {
  type: "key pair";
  publicSigningKey: Uint8Array;
  privateSigningKey: Uint8Array;
  publicEncryptionKey: Uint8Array;
  privateEncryptionKey: Uint8Array;
}

export interface ContrasleuthSymmetricKey {
  type: "symmetric key";
  key: Uint8Array;
}

export type ContrasleuthKey = ContrasleuthKeyPair | ContrasleuthSymmetricKey;

export interface ContrasleuthSignedPublicHalf {
  publicSigningKey: Uint8Array;
  publicEncryptionKey: Uint8Array;
  publicEncryptionKeySignature: Uint8Array;
}

export interface ContrasleuthPublicHalf {
  publicSigningKey: Uint8Array;
  publicEncryptionKey: Uint8Array;
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
  recipientDigest: Uint8Array;
  publicHalf: ContrasleuthSignedPublicHalf;
  message: string;
  signature: Uint8Array;
}

export interface ContrasleuthMessage {
  recipient: ContrasleuthRecipient;
  publicHalf: ContrasleuthPublicHalf;
  message: string;
  signatureHash: Uint8Array;
}

export interface ContrasleuthIdentity {
  id: string;
  name: string;
  keyPair: ContrasleuthKeyPair;
  inbox: ObservableSet<IObservableObject & ContrasleuthMessage>;
  groups: ObservableSet<IObservableObject & ContrasleuthUnmoderatedGroup>;
}
