import express from "express";
import instantiate, {
  AmphitheaterObject,
  AmphitheaterPeer
} from "amphitheater";
import { prepare, unprepare } from "bigint-json-interop";
import { autorun, observable, ObservableSet, observe } from "mobx";
import publicIP from "public-ip";
import * as fs from "fs";
import { promisify } from "util";
import bodyParser from "body-parser";
import sodium from "libsodium-wrappers";
import { writeFile } from "steno";
import {
  ContrasleuthKeyPair,
  ContrasleuthIdentity,
  ContrasleuthSymmetricKey,
  ContrasleuthSignedPublicHalf,
  ContrasleuthPublicHalf,
  ContrasleuthUnmoderatedGroup,
  ContrasleuthRecipient,
  ContrasleuthSignedMessage,
  ContrasleuthMessage
} from "contrasleuth-typedefs";

// Monkey-patch Uint8Array for JSON serialization.
{
  let warned = false;
  Object.assign(Uint8Array.prototype, {
    toJSON: function() {
      if (!warned) {
        console.warn(
          new Error(
            "Uint8Array.prototype.toJSON has been monkey-patched. This may be intended, consult the stack trace below for details."
          )
        );
        warned = true;
      }
      return [...((this as unknown) as Uint8Array)];
    }
  });
}

const isByteArray = (possiblyArray: any): boolean => {
  if (!Array.isArray(possiblyArray)) return false;
  return possiblyArray.every(
    element =>
      Number(element) === element &&
      0 <= element &&
      element < 256 &&
      element % 1 === 0
  );
};

// Note: Every Uint8Array must be recast to Uint8Array
// before passing to libsodium because the Uint8Arrays
// might be proxied by MobX.

const createKeyPair = (): ContrasleuthKeyPair => {
  const {
    publicKey: publicEncryptionKey,
    privateKey: privateEncryptionKey
  } = sodium.crypto_box_keypair();
  const {
    publicKey: publicSigningKey,
    privateKey: privateSigningKey
  } = sodium.crypto_sign_keypair();
  return {
    type: "key pair",
    publicEncryptionKey,
    privateEncryptionKey,
    publicSigningKey,
    privateSigningKey
  };
};

const createIdentity = (name: string): ContrasleuthIdentity => ({
  keyPair: createKeyPair(),
  name
});

const validatePublicHalf = ({
  publicEncryptionKey,
  publicSigningKey,
  publicEncryptionKeySignature
}: ContrasleuthSignedPublicHalf): ContrasleuthPublicHalf | undefined => {
  if (
    sodium.crypto_sign_verify_detached(
      new Uint8Array(publicEncryptionKeySignature),
      new Uint8Array(publicEncryptionKey),
      new Uint8Array(publicSigningKey)
    )
  ) {
    return { publicEncryptionKey, publicSigningKey };
  }
};

const calculateRecipientDigest = (
  recipient: ContrasleuthRecipient
): Uint8Array => {
  switch (recipient.type) {
    case "unmoderated group":
      return sodium.crypto_generichash(
        sodium.crypto_generichash_BYTES,
        new Uint8Array(recipient.data.key.key)
      );
    case "public half":
      return sodium.crypto_generichash(
        sodium.crypto_generichash_BYTES,
        new Uint8Array(recipient.data.publicSigningKey)
      );
  }
};

const validateMessage = (
  {
    publicHalf,
    message,
    signature,
    recipientDigest
  }: ContrasleuthSignedMessage,
  recipient: ContrasleuthRecipient
): ContrasleuthMessage | undefined => {
  const validatedPublicHalf = validatePublicHalf(publicHalf);
  if (validatedPublicHalf === undefined) return;
  const expectedRecipientDigest = calculateRecipientDigest(recipient);
  if (
    JSON.stringify(expectedRecipientDigest) !== JSON.stringify(recipientDigest)
  ) {
    return;
  }
  if (
    sodium.crypto_sign_verify_detached(
      new Uint8Array(signature),
      new Uint8Array([
        ...sodium.crypto_generichash(sodium.crypto_generichash_BYTES, message),
        ...recipientDigest
      ]),
      new Uint8Array(validatedPublicHalf.publicSigningKey)
    )
  ) {
    return {
      publicHalf: validatedPublicHalf,
      message,
      signatureHash: sodium.crypto_generichash(
        sodium.crypto_generichash_BYTES,
        new Uint8Array(signature)
      ),
      recipient
    };
  }
};

const derivePublicHalf = (
  identity: ContrasleuthKeyPair
): ContrasleuthSignedPublicHalf => {
  return {
    publicEncryptionKey: identity.publicEncryptionKey,
    publicSigningKey: identity.publicSigningKey,
    publicEncryptionKeySignature: sodium.crypto_sign_detached(
      new Uint8Array(identity.publicEncryptionKey),
      new Uint8Array(identity.privateSigningKey)
    )
  };
};

const createSignedMessage = (
  identity: ContrasleuthKeyPair,
  message: string,
  recipient: ContrasleuthRecipient
): ContrasleuthSignedMessage => {
  const recipientDigest = calculateRecipientDigest(recipient);
  return {
    signature: sodium.crypto_sign_detached(
      new Uint8Array([
        ...sodium.crypto_generichash(sodium.crypto_generichash_BYTES, message),
        ...recipientDigest
      ]),
      new Uint8Array(identity.privateSigningKey)
    ),
    publicHalf: derivePublicHalf(identity),
    message,
    recipientDigest
  };
};

const createSymmetricallyEncryptedMessage = (
  key: ContrasleuthSymmetricKey,
  message: ContrasleuthSignedMessage
): Uint8Array => {
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);
  return new Uint8Array([
    ...sodium.crypto_secretbox_easy(
      JSON.stringify(message),
      nonce,
      new Uint8Array(key.key)
    ),
    ...nonce
  ]);
};

const parseMessage = (
  plaintext: string,
  recipient: ContrasleuthRecipient
): ContrasleuthMessage | undefined => {
  type JSONParseResult =
    | {
        type: "error";
      }
    | {
        type: "success";
        data: any;
      };

  const parseJSON = (json: string): JSONParseResult => {
    try {
      return { type: "success", data: JSON.parse(json) };
    } catch {
      return { type: "error" };
    }
  };

  const parseResult = parseJSON(plaintext);
  if (parseResult.type === "error") {
    return;
  }
  const { data } = parseResult;
  if (Object(data.publicHalf) !== data.publicHalf) {
    return;
  }
  if (
    !Array.isArray(data.publicHalf.publicSigningKey) ||
    !Array.isArray(data.publicHalf.publicEncryptionKey)
  ) {
    return;
  }
  if (
    data.publicHalf.publicSigningKey.some(
      (element: any) => typeof element !== "number"
    ) ||
    data.publicHalf.publicSigningKey.length !==
      sodium.crypto_sign_PUBLICKEYBYTES
  ) {
    return;
  }
  if (
    data.publicHalf.publicEncryptionKey.some(
      (element: any) => typeof element !== "number"
    ) ||
    data.publicHalf.publicEncryptionKey.length !==
      sodium.crypto_box_PUBLICKEYBYTES
  ) {
    return;
  }
  if (
    data.publicHalf.publicEncryptionKeySignature.some(
      (element: any) => typeof element !== "number"
    ) ||
    data.publicHalf.publicEncryptionKeySignature.length !==
      sodium.crypto_sign_BYTES
  ) {
    return;
  }
  if (typeof data.message !== "string") {
    return;
  }
  if (
    !Array.isArray(data.signature) ||
    data.signature.length !== sodium.crypto_sign_BYTES
  ) {
    return;
  }
  if (
    !Array.isArray(data.recipientDigest) ||
    data.recipientDigest.length !== sodium.crypto_generichash_BYTES
  ) {
    return;
  }
  const message: ContrasleuthSignedMessage = {
    message: data.message,
    signature: new Uint8Array(data.signature),
    publicHalf: {
      publicEncryptionKey: new Uint8Array(data.publicHalf.publicEncryptionKey),
      publicSigningKey: new Uint8Array(data.publicHalf.publicSigningKey),
      publicEncryptionKeySignature: new Uint8Array(
        data.publicHalf.publicEncryptionKeySignature
      )
    },
    recipientDigest: new Uint8Array(data.recipientDigest)
  };

  return validateMessage(message, recipient);
};

const decryptSymmetricallyEncryptedMessage = (
  key: ContrasleuthSymmetricKey,
  ciphertext: Uint8Array,
  recipient: ContrasleuthRecipient
): ContrasleuthMessage | undefined => {
  const nonce = ciphertext.subarray(
    ciphertext.length - sodium.crypto_box_NONCEBYTES,
    ciphertext.length
  );
  const ciphertext2 = ciphertext.subarray(
    0,
    ciphertext.length - sodium.crypto_box_NONCEBYTES
  );

  return parseMessage(
    sodium.crypto_secretbox_open_easy(
      new Uint8Array(ciphertext2),
      new Uint8Array(nonce),
      new Uint8Array(key.key),
      "text"
    ),
    recipient
  );
};

const objects: ObservableSet<AmphitheaterObject> = observable(
  new Set()
) as ObservableSet<AmphitheaterObject>;
const peers: ObservableSet<AmphitheaterPeer> = observable(
  new Set([
    {
      nonce: 0xdeadbeefn, // Totally fake nonce
      address: "contrasleuth-discovery.glitch.me",
      // A large expirationTime (dead coffee, bad food, feed code)
      expirationTime: 0xdeadc0ffeebadf00dfeedc0den
    }
  ])
);
const addresses: ObservableSet<string> = observable(new Set() as Set<string>);
const groups: ObservableSet<ContrasleuthUnmoderatedGroup> = observable(
  new Set() as Set<ContrasleuthUnmoderatedGroup>
);
const identities: ObservableSet<ContrasleuthIdentity> = observable(
  new Set() as Set<ContrasleuthIdentity>
);
const inbox: ObservableSet<ContrasleuthMessage> = observable(new Set() as Set<
  ContrasleuthMessage
>);

interface MapDerivationResult<K, V> {
  map: Map<K, V>;
  stop: () => void;
}

const deriveMapFromObservableSet = <K, V>(
  set: ObservableSet<V>,
  extractKey: (element: V) => K
): MapDerivationResult<K, V> => {
  const map: Map<K, V> = new Map();

  set.forEach(
    (element): void => {
      map.set(extractKey(element), element);
    }
  );

  const unsubscribe = observe(
    set,
    (change): void => {
      if (change.type === "add") {
        map.set(extractKey(change.newValue), change.newValue);
      } else if (change.type === "delete") {
        map.delete(extractKey(change.oldValue));
      }
    }
  );
  return { map, stop: unsubscribe };
};

const deriveInbox = () => {
  const inboxMap = deriveMapFromObservableSet(inbox, message =>
    Buffer.from(message.signatureHash).toString()
  );

  const parseObject = (object: string) =>
    [...groups]
      .map(group =>
        decryptSymmetricallyEncryptedMessage(
          group.key,
          new Uint8Array(Buffer.from(object, "base64")),
          { type: "unmoderated group", data: group }
        )
      )
      .find(message => message !== undefined);

  const addMessageToInbox = (message: ContrasleuthMessage | undefined) => {
    if (message === undefined) return;
    if (inboxMap.map.has(Buffer.from(message.signatureHash).toString())) return;
    inbox.add(message);
  };

  const initialParse = () => {
    objects.forEach(object => addMessageToInbox(parseObject(object.payload)));
  };

  const reactiveParse = () => {
    observe(objects, change => {
      if (change.type !== "add") return;
      addMessageToInbox(parseObject(change.newValue.payload));
    });
  };

  initialParse();
  reactiveParse();
};

const findUnmoderatedGroup = (() => {
  const groupMap = deriveMapFromObservableSet(groups, group =>
    JSON.stringify(group.key.key)
  );
  return (key: Uint8Array) => groupMap.map.get(JSON.stringify(key));
})();

const readFile = promisify(fs.readFile);

const JSON_FILE = "contrasleuth.json";
const AMPHITHEATER_PORT = 4010;
const API_SERVER_PORT = 4011;

(async () => {
  await sodium.ready;

  const {
    objects: objectArray,
    peers: peerArray,
    groups: groupArray,
    identities: identityArray,
    inbox: inboxArray
  } = (await (async () => {
    if (fs.existsSync(JSON_FILE)) {
      const json = (await readFile(JSON_FILE)).toString();
      try {
        return unprepare(JSON.parse(json));
      } catch (error) {
        console.log("contrasleuth.json contains malformed data. Ignoring.");
        console.error(error);
      }
    }

    return {
      objects: [],
      peers: [],
      groups: [],
      identities: [],
      inbox: []
    };
  })()) as {
    objects: AmphitheaterObject[];
    peers: AmphitheaterPeer[];
    groups: ContrasleuthUnmoderatedGroup[];
    identities: ContrasleuthIdentity[];
    inbox: ContrasleuthMessage[];
  };

  Promise.all([publicIP.v4(), publicIP.v6()]).then(([ipv4, ipv6]) => {
    addresses.add(ipv4 + ":" + AMPHITHEATER_PORT);
    addresses.add("[" + ipv6 + "]:" + AMPHITHEATER_PORT);
  });

  objectArray.forEach(object => objects.add(object));
  peerArray.forEach(peer => peers.add(peer));
  groupArray.forEach(group => groups.add(group));
  identityArray.forEach(identity => identities.add(identity));
  inboxArray.forEach(message => inbox.add(message));

  const { server: amphitheaterServer, createObject } = await instantiate(
    objects,
    peers,
    addresses
  );

  await new Promise(resolve => {
    amphitheaterServer
      .listen(AMPHITHEATER_PORT)
      .on("error", () => {
        console.log(
          `Port ${AMPHITHEATER_PORT} (Amphitheater server) not available. Contrasleuth failed to start.`
        );
        process.exit(1);
      })
      .on("listening", () => {
        resolve();
      });
  });

  autorun(() => {
    const stringified = JSON.stringify(
      prepare({
        objects: [...objects],
        peers: [...peers],
        groups: [...groups],
        identities: [...identities],
        inbox: [...inbox]
      })
    );
    writeFile(JSON_FILE, stringified, error => {
      if (error !== null && error !== undefined) throw error;
    });
  });

  deriveInbox();

  const createNewUnmoderatedGroup = (
    name: string
  ): ContrasleuthUnmoderatedGroup => ({
    name,
    key: { type: "symmetric key", key: sodium.crypto_secretbox_keygen() }
  });

  const app = express();
  app.use(bodyParser.json());

  app.post("/create-identity", (request, response) => {
    const name = request.body.name;
    if (typeof name !== "string") {
      response.sendStatus(400);
      return;
    }
    identities.add(createIdentity(name));
    response.sendStatus(200);
  });

  app.get("/identities", (_request, response) => {
    response.send([...identities]);
  });

  app.post("/create-unmoderated-group", (request, response) => {
    const name = request.body.name;
    if (typeof name !== "string") {
      response.sendStatus(400);
      return;
    }

    groups.add(createNewUnmoderatedGroup(name));
    response.sendStatus(200);
  });

  app.get("/groups", (_request, response) => {
    response.send([...groups]);
  });

  app.post("/join-unmoderated-group", (request, response) => {
    const name = request.body.name;
    if (typeof name !== "string") {
      response.sendStatus(400);
      return;
    }

    if (!isByteArray(request.body.key)) {
      response.sendStatus(400);
      return;
    }
    const key = new Uint8Array(request.body.key);
    groups.add({ name, key: { type: "symmetric key", key } });

    response.sendStatus(200);
  });

  app.post("/rename-unmoderated-group", (request, response) => {
    const name = request.body.name;
    if (typeof name !== "string") {
      response.sendStatus(400);
      return;
    }

    if (!isByteArray(request.body.key)) {
      response.sendStatus(400);
      return;
    }

    const key = new Uint8Array(request.body.key);
    const group = findUnmoderatedGroup(key);
    if (group === undefined) {
      response.sendStatus(404);
      return;
    }

    group.name = name;
    response.sendStatus(200);
  });

  app.post("/leave-unmoderated-group", (request, response) => {
    if (!isByteArray(request.body.key)) {
      response.sendStatus(400);
      return;
    }

    const key = new Uint8Array(request.body.key);
    const group = findUnmoderatedGroup(key);
    if (group === undefined) {
      response.sendStatus(404);
      return;
    }

    groups.delete(group);
    response.sendStatus(200);
  });

  app.post("/create-post-in-unmoderated-group", async (request, response) => {
    const content = request.body.content;
    const publicSigningKey = request.body.publicSigningKey;
    const privateSigningKey = request.body.privateSigningKey;
    const publicEncryptionKey = request.body.publicEncryptionKey;
    const privateEncryptionKey = request.body.privateEncryptionKey;

    if (
      typeof content !== "string" ||
      !isByteArray(request.body.key) ||
      isNaN(request.body.timeToLive)
    ) {
      response.sendStatus(400);
      return;
    }

    const key = new Uint8Array(request.body.key);

    if (
      ![
        publicEncryptionKey,
        privateEncryptionKey,
        publicSigningKey,
        privateSigningKey
      ].every(isByteArray)
    ) {
      response.sendStatus(400);
      return;
    }

    if (publicEncryptionKey.length !== sodium.crypto_box_PUBLICKEYBYTES) {
      response.sendStatus(400);
      return;
    }

    if (privateEncryptionKey.length !== sodium.crypto_box_SECRETKEYBYTES) {
      response.sendStatus(400);
      return;
    }

    if (publicSigningKey.length !== sodium.crypto_sign_PUBLICKEYBYTES) {
      response.sendStatus(400);
      return;
    }

    if (privateSigningKey.length !== sodium.crypto_sign_SECRETKEYBYTES) {
      response.sendStatus(400);
      return;
    }

    const identity: ContrasleuthKeyPair = {
      type: "key pair",
      publicEncryptionKey: new Uint8Array(publicEncryptionKey),
      privateEncryptionKey: new Uint8Array(privateEncryptionKey),
      publicSigningKey: new Uint8Array(publicSigningKey),
      privateSigningKey: new Uint8Array(privateSigningKey)
    };

    const timeToLive = BigInt(request.body.timeToLive);

    const group = findUnmoderatedGroup(key);
    if (group === undefined) {
      response.sendStatus(400);
      return;
    }
    objects.add(
      await createObject(
        Buffer.from(
          createSymmetricallyEncryptedMessage(
            { key, type: "symmetric key" },
            createSignedMessage(identity, content, {
              type: "unmoderated group",
              data: group
            })
          )
        ).toString("base64"),
        timeToLive
      )
    );

    response.sendStatus(200);
  });

  app.get("/inbox", (_request, response) => {
    response.send(JSON.stringify([...inbox]));
  });

  app
    .listen(API_SERVER_PORT, () => {
      console.log(
        `Contrasleuth is working. Port ${AMPHITHEATER_PORT} (Amphitheater server) and ${API_SERVER_PORT} (Contrasleuth API server) are both ready.`
      );
    })
    .on("error", () => {
      console.log(
        `Port ${API_SERVER_PORT} (Contrasleuth API server) not available. Contrasleuth failed to start.`
      );
    });
})();
