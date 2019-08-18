import React from "react";
import ReactDOM from "react-dom";
import * as sodium from "libsodium-wrappers";
import "./index.css";
import App from "./components/App";
import * as serviceWorker from "./serviceWorker";
import * as debug_syncState from "./rpc/sync-state-with-server";
import * as debug_rpc from "./rpc/rpc-commands";

((window as unknown) as Record<any, any>).debug_syncState = debug_syncState;
((window as unknown) as Record<any, any>).debug_rpc = debug_rpc;

sodium.ready.then(() =>
  ReactDOM.render(<App />, document.getElementById("root"))
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
