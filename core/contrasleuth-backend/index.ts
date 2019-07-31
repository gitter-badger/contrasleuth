import express from "express";
import instantiate, {
  AmphitheaterObject,
  AmphitheaterPeer
} from "amphitheater";
import { prepare, unprepare } from "bigint-json-interop";
import {
  autorun,
  observable,
  ObservableSet,
  ObservableMap,
  observe,
  IObservableObject
} from "mobx";
import publicIP from "public-ip";
import * as fs from "fs";
import { promisify } from "util";
import bodyParser from "body-parser";
import sodium from "libsodium-wrappers";
import { writeFile } from "steno";
import uuid from "uuid/v4";
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
} from "./interfaces";

// Monkey-patch Uint8Array for JSON serialization.
{
  let warned = false;
  Object.assign(Uint8Array.prototype, {
    toJSON: function(): number[] {
      if (!warned) {
        // eslint-disable-next-line
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

// eslint-disable-next-line
const isByteArray = (possiblyArray: any): boolean => {
  if (!Array.isArray(possiblyArray)) return false;
  return possiblyArray.every(
    (element): boolean =>
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

const createIdentity = (
  name: string
): ContrasleuthIdentity & IObservableObject =>
  observable({
    keyPair: createKeyPair(),
    name,
    inbox: observable(new Set() as Set<
      IObservableObject & ContrasleuthMessage
    >),
    groups: observable(new Set() as Set<
      IObservableObject & ContrasleuthUnmoderatedGroup
    >),
    id: uuid()
  });

const createNewUnmoderatedGroup = (
  name: string
): ContrasleuthUnmoderatedGroup => ({
  name,
  key: { type: "symmetric key", key: sodium.crypto_secretbox_keygen() }
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
        // eslint-disable-next-line
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
      // eslint-disable-next-line
      (element: any): boolean => typeof element !== "number"
    ) ||
    data.publicHalf.publicSigningKey.length !==
      sodium.crypto_sign_PUBLICKEYBYTES
  ) {
    return;
  }
  if (
    data.publicHalf.publicEncryptionKey.some(
      // eslint-disable-next-line
      (element: any): boolean => typeof element !== "number"
    ) ||
    data.publicHalf.publicEncryptionKey.length !==
      sodium.crypto_box_PUBLICKEYBYTES
  ) {
    return;
  }
  if (
    data.publicHalf.publicEncryptionKeySignature.some(
      // eslint-disable-next-line
      (element: any): boolean => typeof element !== "number"
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
const identities: ObservableSet<
  IObservableObject & ContrasleuthIdentity
> = observable(new Set() as Set<IObservableObject & ContrasleuthIdentity>);
interface MapDerivationResult<K, V> {
  map: ObservableMap<K, V>;
  stop: () => void;
}

const deriveMapFromObservableSet = <K, V>(
  set: ObservableSet<IObservableObject & V>,
  extractKey: (element: V) => K
): MapDerivationResult<K, V> => {
  const map: ObservableMap<K, V> = observable(new Map());

  set.forEach((element): void => {
    map.set(extractKey(element), element);
  });

  const unsubscribe = observe(set, (change): void => {
    if (change.type === "add") {
      map.set(extractKey(change.newValue), change.newValue);
    } else if (change.type === "delete") {
      map.delete(extractKey(change.oldValue));
    }
  });
  return { map, stop: unsubscribe };
};

const deriveInbox = (identity: ContrasleuthIdentity): (() => void) => {
  const { inbox } = identity;
  const { map: inboxMap, stop: stopDerivingMap } = deriveMapFromObservableSet(
    inbox,
    (message): string => Buffer.from(message.signatureHash).toString()
  );

  const parseObject = (object: string): ContrasleuthMessage | undefined =>
    [...identity.groups]
      .map((group): ContrasleuthMessage | undefined =>
        decryptSymmetricallyEncryptedMessage(
          group.key,
          new Uint8Array(Buffer.from(object, "base64")),
          { type: "unmoderated group", data: group }
        )
      )
      .find((message): boolean => message !== undefined);

  const addMessageToInbox = (
    message: ContrasleuthMessage | undefined
  ): void => {
    if (message === undefined) return;
    if (inboxMap.has(Buffer.from(message.signatureHash).toString())) return;
    inbox.add(observable(message));
  };

  const initialParse = (): void => {
    objects.forEach((object): void =>
      addMessageToInbox(parseObject(object.payload))
    );
  };

  const reactiveParse = (): (() => void) => {
    return observe(objects, (change): void => {
      if (change.type !== "add") return;
      addMessageToInbox(parseObject(change.newValue.payload));
    });
  };

  initialParse();
  const stopReactivelyParsingObjects = reactiveParse();

  return (): void => {
    stopDerivingMap();
    stopReactivelyParsingObjects();
  };
};

const readFile = promisify(fs.readFile);

const JSON_FILE = "contrasleuth.json";
const AMPHITHEATER_PORT = 4010;
const API_SERVER_PORT = 4011;

(async (): Promise<void> => {
  await sodium.ready;

  // JSON doesn't support ES6 Sets.
  // These interfaces serves as intermediate data types before getting
  // converted to ContrasleuthIdentity proper.
  interface DeserializedKeyPair {
    type: "key pair";
    publicSigningKey: number[];
    privateSigningKey: number[];
    publicEncryptionKey: number[];
    privateEncryptionKey: number[];
  }

  interface DeserializedIdentity {
    id: string;
    name: string;
    keyPair: DeserializedKeyPair;
    inbox: ContrasleuthMessage[];
    groups: ContrasleuthUnmoderatedGroup[];
  }

  const {
    objects: objectArray,
    peers: peerArray,
    identities: identityArray
  } = (await (async (): Promise<{
    objects: AmphitheaterObject[];
    peers: AmphitheaterPeer[];
    identities: DeserializedIdentity[];
  }> => {
    if (fs.existsSync(JSON_FILE)) {
      const json = (await readFile(JSON_FILE)).toString();
      try {
        return unprepare(JSON.parse(json));
      } catch (error) {
        // eslint-disable-next-line
        console.log("contrasleuth.json contains malformed data. Ignoring.");
        // eslint-disable-next-line
        console.error(error);
      }
    }

    return {
      objects: [],
      peers: [],
      identities: []
    };
  })()) as {
    objects: AmphitheaterObject[];
    peers: AmphitheaterPeer[];
    identities: DeserializedIdentity[];
  };

  Promise.all([publicIP.v4(), publicIP.v6()]).then(([ipv4, ipv6]): void => {
    addresses.add(ipv4 + ":" + AMPHITHEATER_PORT);
    addresses.add("[" + ipv6 + "]:" + AMPHITHEATER_PORT);
  });

  objectArray.forEach((object): void => {
    objects.add(object);
  });
  peerArray.forEach((peer): void => {
    peers.add(peer);
  });
  identityArray.forEach((identity): void => {
    identities.add(
      observable({
        ...identity,
        inbox: observable(
          new Set(
            identity.inbox.map((message): ContrasleuthMessage &
              IObservableObject => observable(message))
          )
        ),
        groups: observable(
          new Set(
            identity.groups.map((group): ContrasleuthUnmoderatedGroup &
              IObservableObject => observable(group))
          )
        ),
        keyPair: {
          ...identity.keyPair,
          publicSigningKey: new Uint8Array(identity.keyPair.publicSigningKey),
          privateSigningKey: new Uint8Array(identity.keyPair.privateSigningKey),
          publicEncryptionKey: new Uint8Array(
            identity.keyPair.publicEncryptionKey
          ),
          privateEncryptionKey: new Uint8Array(
            identity.keyPair.privateEncryptionKey
          )
        }
      })
    );
  });

  const { server: amphitheaterServer, createObject } = await instantiate(
    objects,
    peers,
    addresses
  );

  await new Promise((resolve): void => {
    amphitheaterServer
      .listen(AMPHITHEATER_PORT)
      .on("error", (): void => {
        // eslint-disable-next-line
        console.log(
          `Port ${AMPHITHEATER_PORT} (Amphitheater server) not available. Contrasleuth failed to start.`
        );
        process.exit(1);
      })
      .on("listening", (): void => {
        resolve();
      });
  });

  autorun((): void => {
    const stringified = JSON.stringify(
      prepare({
        objects: [...objects],
        peers: [...peers],
        // eslint-disable-next-line
        identities: [...identities].map((identity): any => ({
          ...identity,
          inbox: [...identity.inbox],
          groups: [...identity.groups]
        }))
      })
    );
    writeFile(JSON_FILE, stringified, (error): void => {
      if (error !== null && error !== undefined) throw error;
    });
  });

  const app = express();
  app.use(bodyParser.json());

  app.post("/create-identity", (request, response): void => {
    const name = request.body.name;
    if (typeof name !== "string") {
      response.sendStatus(400);
      return;
    }
    identities.add(observable(createIdentity(name)));
    response.sendStatus(200);
  });

  app.get("/identities", (_request, response): void => {
    response.send(
      [...identities].map(({ id, name, keyPair }): {
        id: string;
        name: string;
        keyPair: ContrasleuthKeyPair;
      } => ({ id, name, keyPair }))
    );
  });

  interface IdentityHandler {
    router: express.Router;
    stop: () => void;
  }

  const handleIdentitySpecificRoutes = (
    identity: IObservableObject & ContrasleuthIdentity
  ): IdentityHandler => {
    const { groups, inbox } = identity;

    const router = express.Router();

    const {
      map: groupMap,
      stop: stopDerivingGroupMap
    } = deriveMapFromObservableSet(groups, (group): string => {
      return JSON.stringify(group.key.key);
    });

    const stopDerivingInbox = deriveInbox(identity);

    const findUnmoderatedGroup = (
      key: Uint8Array
    ): ContrasleuthUnmoderatedGroup | undefined =>
      groupMap.get(JSON.stringify(key));

    router.post("/rename", (request, response): void => {
      const name = request.body.name;
      if (typeof name !== "string") {
        response.sendStatus(400);
        return;
      }
      identity.name = name;
      response.sendStatus(200);
    });

    router.post("/delete", (_request, response): void => {
      identities.delete(identity);
      response.sendStatus(200);
    });

    router.post("/create-unmoderated-group", (request, response): void => {
      const name = request.body.name;
      if (typeof name !== "string") {
        response.sendStatus(400);
        return;
      }

      groups.add(observable(createNewUnmoderatedGroup(name)));
      response.sendStatus(200);
    });

    router.get("/groups", (_request, response): void => {
      response.send([...groups]);
    });

    router.post("/join-unmoderated-group", (request, response): void => {
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
      groups.add(observable({ name, key: { type: "symmetric key", key } }));

      response.sendStatus(200);
    });

    router.post("/rename-unmoderated-group", (request, response): void => {
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

    router.post("/leave-unmoderated-group", (request, response): void => {
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

    router.post(
      "/create-post-in-unmoderated-group",
      async (request, response): Promise<void> => {
        const content = request.body.content;

        if (
          typeof content !== "string" ||
          !isByteArray(request.body.key) ||
          isNaN(request.body.timeToLive)
        ) {
          response.sendStatus(400);
          return;
        }

        const key = new Uint8Array(request.body.key);

        const { keyPair } = identity;

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
                createSignedMessage(keyPair, content, {
                  type: "unmoderated group",
                  data: group
                })
              )
            ).toString("base64"),
            timeToLive
          )
        );

        response.sendStatus(200);
      }
    );

    router.get("/inbox", (_request, response): void => {
      response.send([...inbox]);
    });

    return {
      router,
      stop: (): void => {
        stopDerivingGroupMap();
        stopDerivingInbox();
      }
    };
  };

  const identityHandlerMap = new Map<string, IdentityHandler>();

  app.use("/:id/", (request, response, next): void => {
    const id = request.params.id;
    if (typeof id !== "string") {
      response.sendStatus(400);
      return;
    }
    const identityHandler = identityHandlerMap.get(id);
    if (identityHandler === undefined) {
      response.sendStatus(404);
      return;
    }
    identityHandler.router(request, response, next);
  });

  identities.forEach((identity): void => {
    identityHandlerMap.set(identity.id, handleIdentitySpecificRoutes(identity));
  });

  observe(identities, (change): void => {
    if (change.type === "add") {
      const identity = change.newValue;
      const handler = handleIdentitySpecificRoutes(identity);
      identityHandlerMap.set(identity.id, handler);
    }
    if (change.type === "delete") {
      const identity = change.oldValue;
      const handler = identityHandlerMap.get(identity.id);
      if (handler === undefined) return;
      handler.stop();
      identityHandlerMap.delete(identity.id);
    }
  });

  app
    .listen(API_SERVER_PORT, (): void => {
      // eslint-disable-next-line
      console.log(
        `Contrasleuth is working. Port ${AMPHITHEATER_PORT} (Amphitheater server) and ${API_SERVER_PORT} (Contrasleuth API server) are both ready.`
      );
    })
    .on("error", (): void => {
      // eslint-disable-next-line
      console.log(
        `Port ${API_SERVER_PORT} (Contrasleuth API server) not available. Contrasleuth failed to start.`
      );
    });
})();
