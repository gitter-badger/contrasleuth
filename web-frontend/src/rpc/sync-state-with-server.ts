import axios from "./unix-socket-axios";
import { types, applySnapshot, IAnyType, Instance } from "mobx-state-tree";

export const waitUntilServerReady = async () => {
  for (;;) {
    try {
      await axios.get("/identities");
      break;
    } catch (error) {
      if (!error.isAxiosError) throw error;
    }
  }
};

const syncModel = (model: IAnyType, path: string) => (): Promise<
  Instance<typeof model>
> =>
  new Promise(async resolve => {
    const node = model.create((await axios.get(path)).data);
    resolve(node);
    for (;;) {
      applySnapshot(node, (await axios.get(path)).data);
    }
  });

export const KeyPair = types.model("KeyPair", {
  type: types.literal("key pair"),
  publicSigningKey: types.array(types.number),
  privateSigningKey: types.array(types.number),
  publicEncryptionKey: types.array(types.number),
  privateEncryptionKey: types.array(types.number)
});

export const PublicHalf = types.model("PublicHalf", {
  publicSigningKey: types.array(types.number),
  publicEncryptionKey: types.array(types.number)
});

export const SymmetricKey = types.model("SymmetricKey", {
  type: types.literal("symmetric key"),
  key: types.array(types.number)
});

export const Identity = types.model("Identity", {
  id: types.identifier,
  name: types.string,
  keyPair: KeyPair
});

export const Identities = types.array(Identity);

export const syncIdentities = syncModel(Identities, "/identities");

export const UnmoderatedGroup = types.model("UnmoderatedGroup", {
  name: types.string,
  key: SymmetricKey
});

export const Recipient = types.union(
  types.model({
    type: types.literal("unmoderated group"),
    data: UnmoderatedGroup
  }),
  types.model({
    type: types.literal("public half"),
    data: PublicHalf
  })
);

export const Message = types.model("Message", {
  recipient: Recipient,
  publicHalf: PublicHalf,
  message: types.string,
  signatureHash: types.array(types.number)
});

export const Inbox = types.array(Message);

export const syncInbox = (identity: Instance<typeof Identity>) =>
  syncModel(Inbox, `/${identity.id}/inbox`)();

export const Groups = types.array(UnmoderatedGroup);

export const syncGroups = (identity: Instance<typeof Identity>) =>
  syncModel(Groups, `/${identity.id}/groups`)();
