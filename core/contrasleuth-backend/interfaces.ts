import { ObservableSet, IObservableObject } from "mobx";

export interface ContrasleuthKeyPair {
  type: "key pair";
  publicSigningKey: number[];
  privateSigningKey: number[];
  publicEncryptionKey: number[];
  privateEncryptionKey: number[];
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
  receiveTime: string;
}

export interface ContrasleuthIdentity {
  id: string;
  name: string;
  keyPair: ContrasleuthKeyPair;
  inbox: ObservableSet<IObservableObject & ContrasleuthMessage>;
  groups: ObservableSet<IObservableObject & ContrasleuthUnmoderatedGroup>;
}
