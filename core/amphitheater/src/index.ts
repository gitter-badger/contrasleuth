import express from "express";
import { observe, ObservableSet, autorun } from "mobx";
import axios from "axios";
import instantiatePoW from "bitmessage-inspired-proof-of-work";
import * as http from "http";
import * as bodyParser from "body-parser";
import sodium from "libsodium-wrappers";
import WebSocket from "ws";
import * as url from "url";
import { Worker } from "worker_threads";
import EventEmitter from "events";
import * as path from "path";
import { prepare, unprepare } from "bigint-json-interop";
import { shuffle } from "lodash";

type Unsubscribe = () => void;

export interface AmphitheaterObject {
  payload: string;
  nonce: bigint;
  expirationTime: bigint;
  receiveTime: bigint;
}

export interface AmphitheaterPeer {
  address: string;
  nonce: bigint;
  expirationTime: bigint;
}

interface MapDerivationResult<K, V> {
  map: Map<K, V>;
  stop: Unsubscribe;
}

interface Server {
  server: http.Server;
  stop: Unsubscribe;
  createObject(
    payload: string,
    timeToLive: bigint
  ): Promise<AmphitheaterObject>;
}

const hash = (payload: string): string =>
  sodium.crypto_generichash(
    sodium.crypto_generichash_BYTES,
    payload,
    undefined,
    "base64"
  );

export const hashObject = (object: AmphitheaterObject): string => {
  return hash(hash(object.payload) + hash(String(object.expirationTime)));
};

export const hashPeer = (peer: AmphitheaterPeer): string => {
  return hash(hash(peer.address) + hash(String(peer.expirationTime)));
};

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

const instantiate = async (
  objects: ObservableSet<AmphitheaterObject>,
  peers: ObservableSet<AmphitheaterPeer>,
  addresses: ObservableSet<string>,
  agent?: http.Agent,
  silenceNetworkingErrors = false
): Promise<Server> => {
  await sodium.ready;

  const objectMap = deriveMapFromObservableSet(objects, hashObject);
  const peerMap = deriveMapFromObservableSet(peers, hashPeer);

  const { verify } = await instantiatePoW();

  // To make it harder to mount Sybil attacks.
  const TIME_TO_LIVE_MULTIPLIER = 1000n;

  const verifyPeer = (
    address: string,
    timeToLive: bigint,
    nonce: bigint
  ): boolean => {
    const MAX_ADDRESS_LENGTH = 250n;

    if (address.length > MAX_ADDRESS_LENGTH) return false;
    return verify(address, timeToLive * TIME_TO_LIVE_MULTIPLIER, nonce);
  };

  const nonBlockingProofOfWork = (
    payload: string,
    timeToLive: bigint
  ): Promise<bigint> => {
    const worker = new Worker(path.join(__dirname, "proof-of-work-worker.js"));
    worker.postMessage({ payload, timeToLive });
    return new Promise(
      (resolve): void => {
        worker.on(
          "message",
          (value): void => {
            resolve(value);
          }
        );
      }
    );
  };

  const app = express();
  app.use(bodyParser.json());
  app.use(
    (_, response, next): void => {
      // https://enable-cors.org/server_expressjs.html
      response.header("Access-Control-Allow-Origin", "*");
      response.header(
        "Access-Control-Allow-Headers",
        "Origin, X-Requested-With, Content-Type, Accept"
      );
      next();
    }
  );

  const gossipWebSocketServer = new WebSocket.Server({ noServer: true });
  const peerWebSocketServer = new WebSocket.Server({ noServer: true });

  gossipWebSocketServer.on(
    "connection",
    (socket): void => {
      const sendObjectHash = (object: AmphitheaterObject): void => {
        socket.send(hashObject(object));
      };

      shuffle([...objects]).forEach(
        (object): void => {
          sendObjectHash(object);
        }
      );

      const unsubscribe = observe(
        objects,
        (change): void => {
          if (change.type !== "add") return;
          sendObjectHash(change.newValue);
        }
      );

      socket.on(
        "close",
        (): void => {
          unsubscribe();
        }
      );
    }
  );

  peerWebSocketServer.on(
    "connection",
    (socket): void => {
      const sendPeer = (peer: AmphitheaterPeer): void => {
        socket.send(JSON.stringify(prepare(peer)));
      };

      shuffle([...peers]).forEach(
        (peer): void => {
          sendPeer(peer);
        }
      );

      const unsubscribe = observe(
        peers,
        (change): void => {
          if (change.type === "add") {
            sendPeer(change.newValue);
          }
        }
      );

      socket.on(
        "close",
        (): void => {
          unsubscribe();
        }
      );
    }
  );

  app.get(
    "/gossip/:hash",
    (request, response): void => {
      // inaccurate type definition, must work around
      // https://expressjs.com/en/4x/api.html#req.params
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hash = (request.params as any).hash;
      if (typeof hash !== "string") {
        response.sendStatus(400);
        return;
      }

      if (!objectMap.map.has(hash)) {
        response.status(404);
        response.end();
        return;
      }

      response.send(prepare(objectMap.map.get(hash)));
    }
  );

  app.post(
    "/peers",
    (request, response): void => {
      const data = unprepare({
        address: request.body.address,
        nonce: request.body.nonce,
        expirationTime: request.body.expirationTime
      });
      if (
        typeof data.address !== "string" ||
        typeof data.nonce !== "bigint" ||
        typeof data.expirationTime !== "bigint"
      ) {
        response.sendStatus(400);
        return;
      }

      const address = data.address;
      const nonce = BigInt(data.nonce);
      const expirationTime = BigInt(data.expirationTime);

      const currentTime = BigInt(Date.now()) / 1000n;
      const timeToLive = expirationTime - currentTime;

      const peer: AmphitheaterPeer = { address, nonce, expirationTime };

      const peerHash = hashPeer(peer);

      if (
        peerMap.map.has(peerHash) ||
        !verifyPeer(peerHash, timeToLive, nonce)
      ) {
        response.end();
        return;
      }

      peers.add(peer);

      response.end();
    }
  );

  app.post(
    "/gossip",
    (request, response): void => {
      const data = unprepare({
        payload: request.body.payload,
        expirationTime: request.body.expirationTime,
        nonce: request.body.nonce
      });

      const payload = data.payload;

      if (
        typeof payload !== "string" ||
        typeof data.nonce !== "bigint" ||
        typeof data.expirationTime !== "bigint"
      ) {
        response.sendStatus(400);
        return;
      }

      const nonce = BigInt(data.nonce);
      const expirationTime = BigInt(data.expirationTime);

      const currentTime = BigInt(Date.now()) / 1000n;
      const timeToLive = expirationTime - currentTime;

      const object: AmphitheaterObject = { payload, nonce, expirationTime, receiveTime: currentTime };

      const objectHash = hashObject(object);

      if (
        objectMap.map.has(objectHash) ||
        timeToLive < 0 ||
        !verify(objectHash, timeToLive, nonce)
      ) {
        response.end();
        return;
      }

      objects.add({ payload, nonce, expirationTime, receiveTime: currentTime });
      response.end();
    }
  );

  const purgeExpiredItemsInterval = setInterval((): void => {
    peers.forEach(
      (peer): void => {
        if (peer.expirationTime < BigInt(Date.now()) / 1000n) {
          peers.delete(peer);
        }
      }
    );

    objects.forEach(
      (object): void => {
        if (object.expirationTime < BigInt(Date.now()) / 1000n) {
          objects.delete(object);
        }
      }
    );
  }, 1000);

  const events = new EventEmitter();
  events.setMaxListeners(Infinity);

  const connectedPeers: Set<string> = new Set();

  const handlePeer = (peer: AmphitheaterPeer): void => {
    if (connectedPeers.has(peer.address) || addresses.has(peer.address)) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleNetworkingError = (error: any): void => {
      if (error.isAxiosError && silenceNetworkingErrors) return;
      // eslint-disable-next-line no-console
      console.error(error);
    };

    const peerEvents = new EventEmitter();
    const cleanup = (): void => {
      connectedPeers.delete(peer.address);
      peerEvents.emit("stop");
    };
    events.once("stop", cleanup);

    const peerSocket = (): void => {
      const socketURL = new url.URL("ws://placeholder.hostname/peers");
      socketURL.host = peer.address;
      const socket = new WebSocket(socketURL.toString(), {
        agent,
        perMessageDeflate: false
      });

      socket.on("close", cleanup);
      socket.on("error", cleanup);

      peerEvents.once(
        "stop",
        (): void => {
          socket.off("close", cleanup);
          socket.close();
        }
      );

      socket.on(
        "message",
        (message): void => {
          let peer;
          try {
            peer = JSON.parse(message.toString());
          } catch (error) {
            return;
          }

          if (
            typeof peer.address !== "string" ||
            typeof peer.nonce !== "bigint" ||
            typeof peer.expirationTime !== "bigint"
          ) {
            return;
          }

          const address = peer.address;
          const nonce = BigInt(peer.nonce);
          const expirationTime = BigInt(peer.expirationTime);

          const timeToLive = expirationTime - BigInt(Date.now()) / 1000n;
          if (timeToLive < 0) return;

          const peerHash = hashPeer(peer);

          if (peerMap.map.has(peerHash) || !verify(peerHash, timeToLive, nonce))
            return;

          peers.add({ address, nonce, expirationTime });
        }
      );
    };

    const objectSocket = (): void => {
      const socketURL = new url.URL("ws://placeholder.hostname/gossip");
      socketURL.host = peer.address;
      const socket = new WebSocket(socketURL.toString(), {
        agent,
        perMessageDeflate: false
      });

      socket.on("close", cleanup);
      socket.on("error", cleanup);

      peerEvents.once(
        "stop",
        (): void => {
          socket.off("close", cleanup);
          socket.close();
        }
      );

      socket.on(
        "message",
        (data): void => {
          const hash = data.toString();
          if (!objectMap.map.has(hash)) {
            const objectURL = new url.URL(
              "gossip/" + hash,
              "http://placeholder.hostname/"
            );
            objectURL.host = peer.address;
            objectURL.search = "";
            axios
              .get(objectURL.toString(), { httpAgent: agent })
              .then(
                ({ data: rawData }): void => {
                  const data = unprepare(rawData);

                  if (data === undefined || data === null) return;
                  if (
                    typeof data.payload !== "string" ||
                    typeof data.nonce !== "bigint" ||
                    typeof data.expirationTime !== "bigint"
                  ) {
                    return;
                  }
                  const payload = data.payload;
                  const nonce = BigInt(data.nonce);
                  const expirationTime = BigInt(data.expirationTime);
                  const currentTime = BigInt(Date.now()) / 1000n;

                  const timeToLive =
                    expirationTime - currentTime;

                  if (timeToLive < 0) return;

                  const object: AmphitheaterObject = {
                    payload,
                    nonce,
                    expirationTime,
                    receiveTime: currentTime
                  };

                  const objectHash = hashObject(object);

                  if (
                    objectMap.map.has(objectHash) ||
                    !verify(objectHash, timeToLive, nonce)
                  ) {
                    return;
                  }

                  objects.add(object);
                }
              )
              .catch(handleNetworkingError);
          }
        }
      );
    };

    peerSocket();
    objectSocket();

    const unsubscribeObjects = observe(
      objects,
      (change): void => {
        if (change.type === "add") {
          const hash = hashObject(change.newValue);
          const objectURL = new url.URL(
            "gossip/" + hash,
            "http://placeholder.hostname/"
          );
          objectURL.host = peer.address;
          objectURL.search = "";
          axios.get(objectURL.toString(), { httpAgent: agent }).catch(
            (error): void => {
              if (!error.isAxiosError) {
                // eslint-disable-next-line no-console
                console.error(error);
                return;
              }

              if (error.response) {
                if (error.response.status === 404) {
                  const postURL = new url.URL(
                    "gossip/",
                    "http://placeholder.hostname"
                  );
                  postURL.host = peer.address;

                  axios
                    .post(postURL.toString(), prepare(change.newValue), {
                      httpAgent: agent
                    })
                    .catch(handleNetworkingError);

                  return;
                }
              }

              handleNetworkingError(error);
            }
          );
        }
      }
    );

    const unsubscribePeers = observe(
      peers,
      (change): void => {
        if (change.type === "add") {
          const postURL = new url.URL("peers/", "http://placeholder.hostname");
          postURL.host = peer.address;

          axios
            .post(postURL.toString(), prepare(change.newValue), {
              httpAgent: agent
            })
            .catch(handleNetworkingError);
        }
      }
    );

    peerEvents.once(
      "stop",
      (): void => {
        unsubscribeObjects();
        unsubscribePeers();
      }
    );
  };

  peers.forEach(handlePeer);

  const reconnectToPeersEveryTwoSeconds = setInterval((): void => {
    peers.forEach(handlePeer);
  }, 2000);

  events.on("stop", (): void => {
    clearInterval(reconnectToPeersEveryTwoSeconds);
  });

  observe(
    peers,
    (change): void => {
      if (change.type === "add") {
        handlePeer(change.newValue);
      }
    }
  );

  const createPeer = async (
    address: string,
    timeToLive: bigint
  ): Promise<AmphitheaterPeer> => {
    const peer: AmphitheaterPeer = {
      expirationTime: timeToLive + BigInt(Date.now()) / 1000n,
      address,
      nonce: 0n
    };

    peer.nonce = await nonBlockingProofOfWork(
      hashPeer(peer),
      timeToLive * TIME_TO_LIVE_MULTIPLIER
    );

    return peer;
  };

  const createObject = async (
    payload: string,
    timeToLive: bigint
  ): Promise<AmphitheaterObject> => {
    const currentTime = BigInt(Date.now()) / 1000n;

    const object: AmphitheaterObject = {
      expirationTime: timeToLive + BigInt(Date.now()) / 1000n,
      payload,
      nonce: 0n,
      receiveTime: currentTime
    };

    object.nonce = await nonBlockingProofOfWork(hashObject(object), timeToLive);

    return object;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let advertisePeerInterval: any;

  const advertisePeer = (): void => {
    addresses.forEach(
      async (address): Promise<void> => {
        const peer = await createPeer(address, 120n);
        peers.add(peer);
      }
    );
  };

  const stopAutoAdvertisePeer = autorun(
    (): void => {
      clearInterval(advertisePeerInterval);
      advertisePeerInterval = setInterval(advertisePeer, 60000);
      advertisePeer();
    }
  );

  const server = http.createServer(app);

  server.on(
    "upgrade",
    (request, socket, head): void => {
      const pathname = url.parse(request.url).pathname;

      if (pathname === "/gossip") {
        gossipWebSocketServer.handleUpgrade(
          request,
          socket,
          head,
          (socket): void => {
            gossipWebSocketServer.emit("connection", socket, request);
          }
        );
        return;
      }

      if (pathname === "/peers") {
        peerWebSocketServer.handleUpgrade(
          request,
          socket,
          head,
          (socket): void => {
            peerWebSocketServer.emit("connection", socket, request);
          }
        );
        return;
      }

      socket.destroy();
    }
  );

  const stop = (): void => {
    server.close();
    objectMap.stop();
    peerMap.stop();
    clearInterval(purgeExpiredItemsInterval);
    clearInterval(advertisePeerInterval);
    stopAutoAdvertisePeer();
    events.emit("stop");
  };

  return { server, stop, createObject };
};

export default instantiate;
