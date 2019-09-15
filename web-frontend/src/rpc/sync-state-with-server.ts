import axios from "./unix-socket-axios";
import { types, applySnapshot, IAnyType, Instance } from "mobx-state-tree";
import { useEffect, useState } from "react";

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
  [Instance<typeof model>, () => void]
> =>
  new Promise(async resolve => {
    let previousResponse = (await axios.get(path)).data;
    const node = model.create(previousResponse);
    let dead = false;
    const unsubscribe = () => {
      dead = true;
    };
    resolve([node, unsubscribe]);
    while (!dead) {
      const currentResponse = (await axios.get(path)).data;
      if (JSON.stringify(currentResponse) === JSON.stringify(previousResponse))
        continue;
      applySnapshot(node, currentResponse);
      previousResponse = currentResponse;
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
  signatureHash: types.array(types.number),
  receiveTime: types.string
});

export const Contact = types.model("Contact", {
  id: types.string,
  name: types.string,
  publicHalf: PublicHalf
});

export const Inbox = types.array(Message);

export const syncInbox = (identity: Instance<typeof Identity>) =>
  syncModel(Inbox, `/${identity.id}/inbox`)();

export const Groups = types.array(UnmoderatedGroup);

export const syncGroups = (identity: Instance<typeof Identity>) =>
  syncModel(Groups, `/${identity.id}/groups`)();

export const Contacts = types.array(Contact);

export const syncContacts = (identity: Instance<typeof Identity>) =>
  syncModel(Contacts, `/${identity.id}/contacts`)();

export const useModel = <T>(
  syncModel: () => Promise<[Instance<T>, () => void]>
): Instance<T> | undefined => {
  const [state, setState] = useState<Instance<T> | undefined>();

  useEffect(() => {
    let dead = false;
    let cleanup = () => {};
    syncModel().then(([state, unsubscribe]) => {
      if (dead) {
        unsubscribe();
        return;
      }
      cleanup = unsubscribe;
      setState(state);
    });
    return () => {
      dead = true;
      cleanup();
    };
    // eslint-disable-next-line
  }, []);
  return state;
};
