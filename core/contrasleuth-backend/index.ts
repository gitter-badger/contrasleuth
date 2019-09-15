try {
  require("worker_threads");
} catch {
  process.stdout.write(
    "You forgot to pass the --experimental-worker flag to node. Contrasleuth requires worker_threads to work."
  );
  process.exit(1);
}
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
  ContrasleuthMessage,
  ContrasleuthContact
} from "./interfaces";
import externalIP from "external-ip";
import { isV4Format } from "ip";

const getIP = externalIP();

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
    publicEncryptionKey: [...publicEncryptionKey],
    privateEncryptionKey: [...privateEncryptionKey],
    publicSigningKey: [...publicSigningKey],
    privateSigningKey: [...privateSigningKey]
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
    contacts: observable(new Set() as Set<
      IObservableObject & ContrasleuthContact
    >),
    id: uuid()
  });

const createNewUnmoderatedGroup = (
  name: string
): ContrasleuthUnmoderatedGroup => ({
  name,
  key: { type: "symmetric key", key: [...sodium.crypto_secretbox_keygen()] }
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
        new Uint8Array([
          ...recipient.data.publicSigningKey,
          ...recipient.data.publicEncryptionKey
        ])
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
  recipient: ContrasleuthRecipient,
  receiveTime: bigint
): ContrasleuthMessage | undefined => {
  const validatedPublicHalf = validatePublicHalf(publicHalf);
  if (validatedPublicHalf === undefined) return;
  const expectedRecipientDigest = calculateRecipientDigest(recipient);
  if (
    JSON.stringify([...expectedRecipientDigest]) !==
    JSON.stringify(recipientDigest)
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
      signatureHash: [
        ...sodium.crypto_generichash(
          sodium.crypto_generichash_BYTES,
          new Uint8Array(signature)
        )
      ],
      recipient,
      receiveTime: receiveTime.toString()
    };
  }
};

const derivePublicHalf = (
  identity: ContrasleuthKeyPair
): ContrasleuthSignedPublicHalf => {
  return {
    publicEncryptionKey: identity.publicEncryptionKey,
    publicSigningKey: identity.publicSigningKey,
    publicEncryptionKeySignature: [
      ...sodium.crypto_sign_detached(
        new Uint8Array(identity.publicEncryptionKey),
        new Uint8Array(identity.privateSigningKey)
      )
    ]
  };
};

const createSignedMessage = (
  identity: ContrasleuthKeyPair,
  message: string,
  recipient: ContrasleuthRecipient
): ContrasleuthSignedMessage => {
  const recipientDigest = [...calculateRecipientDigest(recipient)];
  return {
    signature: [
      ...sodium.crypto_sign_detached(
        new Uint8Array([
          ...sodium.crypto_generichash(
            sodium.crypto_generichash_BYTES,
            message
          ),
          ...recipientDigest
        ]),
        new Uint8Array(identity.privateSigningKey)
      )
    ],
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

const createAsymmetricallyEncryptedMessage = (
  key: ContrasleuthPublicHalf,
  message: ContrasleuthSignedMessage
): Uint8Array =>
  sodium.crypto_box_seal(
    JSON.stringify(message),
    new Uint8Array(key.publicEncryptionKey)
  );

const parseMessage = (
  plaintext: string,
  recipient: ContrasleuthRecipient,
  receiveTime: bigint
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
    signature: data.signature,
    publicHalf: {
      publicEncryptionKey: data.publicHalf.publicEncryptionKey,
      publicSigningKey: data.publicHalf.publicSigningKey,
      publicEncryptionKeySignature: data.publicHalf.publicEncryptionKeySignature
    },
    recipientDigest: data.recipientDigest
  };

  return validateMessage(message, recipient, receiveTime);
};

const decryptSymmetricallyEncryptedMessage = (
  key: ContrasleuthSymmetricKey,
  ciphertext: Uint8Array,
  recipient: ContrasleuthRecipient,
  receiveTime: bigint
): ContrasleuthMessage | undefined => {
  const nonce = ciphertext.subarray(
    ciphertext.length - sodium.crypto_box_NONCEBYTES,
    ciphertext.length
  );
  const ciphertext2 = ciphertext.subarray(
    0,
    ciphertext.length - sodium.crypto_box_NONCEBYTES
  );
  let decrypted = "";
  try {
    decrypted = sodium.crypto_secretbox_open_easy(
      ciphertext2,
      nonce,
      new Uint8Array(key.key),
      "text"
    );
  } catch {
    return undefined;
  }
  return parseMessage(decrypted, recipient, receiveTime);
};

const decryptAsymmetricallyEncryptedMessage = (
  key: ContrasleuthKeyPair,
  ciphertext: Uint8Array,
  recipient: ContrasleuthRecipient,
  receiveTime: bigint
): ContrasleuthMessage | undefined => {
  let decrypted = "";
  try {
    decrypted = sodium.crypto_box_seal_open(
      ciphertext,
      new Uint8Array(key.publicEncryptionKey),
      new Uint8Array(key.privateEncryptionKey),
      "text"
    );
  } catch {
    return undefined;
  }
  return parseMessage(decrypted, recipient, receiveTime);
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

  const parseObject = (
    object: string,
    receiveTime: bigint
  ): ContrasleuthMessage | undefined =>
    [
      ...[...identity.groups].map((group): ContrasleuthMessage | undefined =>
        decryptSymmetricallyEncryptedMessage(
          group.key,
          new Uint8Array(Buffer.from(object, "base64")),
          { type: "unmoderated group", data: group },
          receiveTime
        )
      ),
      decryptAsymmetricallyEncryptedMessage(
        identity.keyPair,
        new Uint8Array(Buffer.from(object, "base64")),
        {
          type: "public half",
          data: {
            publicEncryptionKey: identity.keyPair.publicEncryptionKey,
            publicSigningKey: identity.keyPair.publicSigningKey
          }
        },
        receiveTime
      )
    ].find((message): boolean => message !== undefined);

  const addMessageToInbox = (
    message: ContrasleuthMessage | undefined
  ): void => {
    if (message === undefined) return;
    if (inboxMap.has(Buffer.from(message.signatureHash).toString())) return;
    inbox.add(observable(message));
  };

  const initialParse = (): void => {
    objects.forEach((object): void =>
      addMessageToInbox(parseObject(object.payload, object.receiveTime))
    );
  };

  const reactiveParse = (): (() => void) => {
    return observe(objects, (change): void => {
      if (change.type !== "add") return;
      addMessageToInbox(
        parseObject(change.newValue.payload, change.newValue.receiveTime)
      );
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

const parseArguments = (): {
  JSON_FILE: string;
  AMPHITHEATER_PORT: number | string;
  API_SERVER_PORT: number | string;
} => {
  const cliArguments = process.argv.slice(2);

  if (cliArguments.length === 1 && ["--help", "-h"].includes(cliArguments[0])) {
    process.stdout.write(
      [
        "Usage: contrasleuth [options]\n",
        "\n",
        "Options:\n",
        "  --help\tPrint this message.\n",
        "  --json-file\tPath to the JSON file for Contrasleuth to persist its data. Default: contrasleuth.json\n",
        "  --amphitheater-port\tPort or Unix socket for Amphitheater. Default: 4010\n",
        "  --api-server-port\tPort or Unix socket for Contrasleuth API server. Default: 4011\n"
      ].join("")
    );
    process.exit(0);
  }

  let JSON_FILE = "contrasleuth.json";
  let AMPHITHEATER_PORT: string | number = 4010;
  let API_SERVER_PORT: string | number = 4011;

  while (cliArguments.length > 0) {
    if (cliArguments[0] === "--json-file") {
      cliArguments.shift();
      if (cliArguments[0] === undefined) {
        process.stdout.write(
          "No argument supplied for --json-file option. Exiting.\n"
        );
        process.exit(1);
      }
      JSON_FILE = cliArguments[0];
      cliArguments.shift();
      continue;
    }
    if (cliArguments[0] === "--amphitheater-port") {
      cliArguments.shift();
      if (cliArguments[0] === undefined) {
        process.stdout.write(
          "No argument supplied for --amphitheater-port option. Exiting.\n"
        );
        process.exit(1);
      }
      AMPHITHEATER_PORT = isNaN(Number(cliArguments[0]))
        ? cliArguments[0]
        : Number(cliArguments[0]);
      cliArguments.shift();
      continue;
    }
    if (cliArguments[0] === "--api-server-port") {
      cliArguments.shift();
      if (cliArguments[0] === undefined) {
        process.stdout.write(
          "No argument supplied for --api-server-port option. Exiting.\n"
        );
        process.exit(1);
      }
      API_SERVER_PORT = isNaN(Number(cliArguments[0]))
        ? cliArguments[0]
        : Number(cliArguments[0]);
      cliArguments.shift();
      continue;
    }
    process.stdout.write("Bad option: " + cliArguments[0] + ". Exiting.\n");
  }

  return { JSON_FILE, AMPHITHEATER_PORT, API_SERVER_PORT };
};

const { JSON_FILE, AMPHITHEATER_PORT, API_SERVER_PORT } = parseArguments();

(async (): Promise<void> => {
  await sodium.ready;

  // JSON doesn't support ES6 Sets.
  // These interfaces serves as intermediate data types before getting
  // converted to ContrasleuthIdentity proper.

  interface DeserializedIdentity {
    id: string;
    name: string;
    keyPair: ContrasleuthKeyPair;
    inbox: ContrasleuthMessage[];
    groups: ContrasleuthUnmoderatedGroup[];
    contacts: ContrasleuthContact[];
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
        process.stdout.write(
          "contrasleuth.json contains malformed data. Ignoring.\n"
        );
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

  const IP_RETRIEVAL_INTERVAL = 5000;

  // Otherwise, AMPHITHEATER_PORT is a Unix socket. Exposing the path might be a security risk.
  if (typeof AMPHITHEATER_PORT === "number") {
    const sleep = (ms: number): Promise<void> =>
      new Promise((resolve): void => void setTimeout(resolve, ms));
    (async (): Promise<void> => {
      for (;;) {
        await new Promise((resolve): void =>
          getIP((error, ip): void => {
            resolve();
            if (error !== null && error !== undefined) {
              process.stdout.write(
                [
                  "Failed to retrieve your public IP address. This error usually means that you are not connected to the Internet, but there may be other causes as well (e.g. Internet censorship).\n",
                  "Next attempt in ",
                  IP_RETRIEVAL_INTERVAL / 1000,
                  "s.\n"
                ].join("")
              );
              return;
            }
            if (isV4Format(ip)) {
              const address = `${ip}:${AMPHITHEATER_PORT}`;
              if (addresses.has(address)) return;
              addresses.add(address);
            } else {
              const address = `[${ip}]:${AMPHITHEATER_PORT}`;
              if (addresses.has(address)) return;
              addresses.add(address);
            }
          })
        );
        await sleep(IP_RETRIEVAL_INTERVAL);
      }
    })();
  }

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
        contacts: observable(
          new Set(
            identity.contacts.map((contact): ContrasleuthContact &
              IObservableObject => observable(contact))
          )
        ),
        keyPair: {
          ...identity.keyPair,
          publicSigningKey: identity.keyPair.publicSigningKey,
          privateSigningKey: identity.keyPair.privateSigningKey,
          publicEncryptionKey: identity.keyPair.publicEncryptionKey,
          privateEncryptionKey: identity.keyPair.privateEncryptionKey
        }
      })
    );
  });

  const { server: amphitheaterServer, createObject } = await instantiate(
    objects,
    peers,
    addresses,
    undefined,
    true
  );

  await new Promise((resolve): void => {
    amphitheaterServer
      .listen(AMPHITHEATER_PORT)
      .on("error", (): void => {
        process.stdout.write(
          `Port ${AMPHITHEATER_PORT} (Amphitheater server) not available. Contrasleuth failed to start.\n`
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
          groups: [...identity.groups],
          contacts: [...identity.contacts]
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
    const { groups, inbox, contacts } = identity;

    const router = express.Router();

    const {
      map: groupMap,
      stop: stopDerivingGroupMap
    } = deriveMapFromObservableSet(groups, (group): string => {
      return JSON.stringify(group.key.key);
    });

    const {
      map: contactMap,
      stop: stopDerivingContactMap
    } = deriveMapFromObservableSet(contacts, ({ id }): string => id);

    const [findContactByPublicHalf, stopDerivingSecondContactMap] = ((): [
      (
        publicEncryptionKey: number[],
        publicSigningKey: number[]
      ) => ContrasleuthContact | undefined,
      () => void
    ] => {
      const { map, stop } = deriveMapFromObservableSet(
        contacts,
        ({ publicHalf: { publicEncryptionKey, publicSigningKey } }): string =>
          JSON.stringify([...publicEncryptionKey, ...publicSigningKey])
      );
      return [
        (
          publicEncryptionKey: number[],
          publicSigningKey: number[]
        ): ContrasleuthContact | undefined =>
          map.get(
            JSON.stringify([...publicEncryptionKey, ...publicSigningKey])
          ),
        stop
      ];
    })();

    const stopDerivingInbox = deriveInbox(identity);

    const findUnmoderatedGroup = (
      key: number[]
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

      const key = request.body.key;
      const group = findUnmoderatedGroup(key);
      if (group !== undefined) {
        response.sendStatus(409);
        return;
      }

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

      const key = request.body.key as number[];
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

      const key = request.body.key;
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

        const key = request.body.key as number[];

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

    router.post(
      "/send-asymmetrically-encrypted-message",
      async (request, response): Promise<void> => {
        const content = request.body.content;

        if (
          typeof content !== "string" ||
          !isByteArray(request.body.publicSigningKey) ||
          !isByteArray(request.body.publicEncryptionKey) ||
          isNaN(request.body.timeToLive)
        ) {
          response.sendStatus(400);
          return;
        }

        const publicSigningKey = request.body.publicSigningKey as number[];
        const publicEncryptionKey = request.body
          .publicEncryptionKey as number[];

        const { keyPair } = identity;
        const recipient: ContrasleuthRecipient = {
          type: "public half",
          data: {
            publicSigningKey,
            publicEncryptionKey
          }
        };

        const timeToLive = BigInt(request.body.timeToLive);

        objects.add(
          await createObject(
            Buffer.from(
              createAsymmetricallyEncryptedMessage(
                recipient.data,
                createSignedMessage(keyPair, content, recipient)
              )
            ).toString("base64"),
            timeToLive
          )
        );

        response.sendStatus(200);
      }
    );

    router.get("/contacts", (_request, response): void => {
      response.send([...contacts]);
    });

    router.post("/add-contact", (request, response): void => {
      if (
        typeof request.body.name !== "string" ||
        !isByteArray(request.body.publicSigningKey) ||
        !isByteArray(request.body.publicEncryptionKey)
      ) {
        response.sendStatus(400);
        return;
      }

      const name = request.body.name as string;
      const publicSigningKey = request.body.publicSigningKey as number[];
      const publicEncryptionKey = request.body.publicEncryptionKey as number[];

      if (
        findContactByPublicHalf(publicEncryptionKey, publicSigningKey) !==
        undefined
      ) {
        response.sendStatus(409);
        return;
      }

      contacts.add(
        observable({
          id: uuid(),
          name,
          publicHalf: {
            publicSigningKey,
            publicEncryptionKey
          }
        })
      );

      response.sendStatus(200);
    });

    router.post("/edit-contact", (request, response): void => {
      if (
        typeof request.body.id !== "string" ||
        typeof request.body.name !== "string" ||
        !isByteArray(request.body.publicSigningKey) ||
        !isByteArray(request.body.publicEncryptionKey)
      ) {
        response.sendStatus(400);
        return;
      }

      const id = request.body.id as string;
      const name = request.body.name as string;
      const publicSigningKey = request.body.publicSigningKey as number[];
      const publicEncryptionKey = request.body.publicEncryptionKey as number[];

      const contact = contactMap.get(id);
      if (contact === undefined) {
        response.sendStatus(404);
        return;
      }

      Object.assign(contact, { name, publicSigningKey, publicEncryptionKey });
      response.sendStatus(200);
    });

    router.post("/delete-contact", (request, response): void => {
      if (typeof request.body.id !== "string") {
        response.sendStatus(400);
        return;
      }

      const id = request.body.id as string;

      const contact = contactMap.get(id);
      if (contact === undefined) {
        response.sendStatus(404);
        return;
      }

      contacts.delete(contact);
      response.sendStatus(200);
    });

    router.get("/inbox", (_request, response): void => {
      response.send([...inbox]);
    });

    return {
      router,
      stop: (): void => {
        stopDerivingGroupMap();
        stopDerivingInbox();
        stopDerivingContactMap();
        stopDerivingSecondContactMap();
      }
    };
  };

  const identityHandlerMap = new Map<string, IdentityHandler>();

  app.use("/:id/", (request, response, next): void => {
    // inaccurate type definition, must work around
    // https://expressjs.com/en/4x/api.html#req.params
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (request.params as any).id;
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
      process.stdout.write(
        `Contrasleuth is working. Port ${AMPHITHEATER_PORT} (Amphitheater server) and ${API_SERVER_PORT} (Contrasleuth API server) are both ready.\n`
      );
    })
    .on("error", (): void => {
      process.stdout.write(
        `Port ${API_SERVER_PORT} (Contrasleuth API server) not available. Contrasleuth failed to start.\n`
      );
      process.exit(1);
    });
})();
