import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Card from "@material-ui/core/Card";
import Divider from "@material-ui/core/Divider";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListSubheader from "@material-ui/core/ListSubheader";
import EditIcon from "@material-ui/icons/Edit";
import DeleteForeverIcon from "@material-ui/icons/DeleteForever";
import AddIcon from "@material-ui/icons/Add";
import Container from "@material-ui/core/Container";
import IconButton from "@material-ui/core/IconButton";
import { Instance } from "mobx-state-tree";
import base32 from "hi-base32";
import { crypto_generichash } from "libsodium-wrappers";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import { makeStyles } from "@material-ui/core/styles";

import * as rpc from "../rpc/sync-state-with-server";
import * as commands from "../rpc/rpc-commands";

const DeleteDialog = ({
  onClose,
  onDelete,
  hash,
  name
}: {
  onClose: () => void;
  onDelete: () => void;
  hash: string;
  name: string;
}) => {
  const [input, setInput] = useState("");
  const typedIdentityHash = input.trim() === hash;
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Delete this identity?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          All groups and messages associated with this identity,{" "}
          <strong>{name}</strong>, will be purged. Type the 80-bit hash of this
          identity (<strong>{hash}</strong>) in the box below to proceed.
        </DialogContentText>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (typedIdentityHash) onDelete();
          }}
        >
          <TextField
            placeholder={hash}
            fullWidth
            margin="normal"
            onChange={event => {
              setInput(event.target.value);
            }}
            value={input}
          />
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onDelete} disabled={!typedIdentityHash}>
          Delete
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const RenameDialog = ({
  name,
  onRename,
  onClose
}: {
  name: string;
  onRename: (name: string) => void;
  onClose: () => void;
}) => {
  const [input, setInput] = useState(name);
  const inputIsEmpty = input.replace(/\s/g, "") === "";
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>Rename</DialogTitle>
      <DialogContent>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (!inputIsEmpty) onRename(input);
          }}
        >
          <TextField
            fullWidth
            onChange={event => {
              setInput(event.target.value);
            }}
            value={input}
          />
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onRename(input)} disabled={inputIsEmpty}>
          Rename
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const Identity = ({
  name,
  hash,
  onDelete,
  onRename
}: {
  name: string;
  hash: string;
  onDelete: () => void;
  onRename: (name: string) => void;
}) => {
  const [actionIconsRef, setActionIconsRef] = useState<HTMLDivElement | null>(
    null
  );
  enum State {
    Initial,
    RenameDialog,
    DeleteConfirmation
  }
  const [state, setState] = useState(State.Initial);
  return (
    <>
      <ListItem button>
        <ListItemText primary={name} secondary={hash} />
        <div ref={setActionIconsRef} />
      </ListItem>
      <>
        {actionIconsRef &&
          createPortal(
            <>
              <IconButton onClick={() => setState(State.RenameDialog)}>
                <EditIcon />
              </IconButton>
              <IconButton onClick={() => setState(State.DeleteConfirmation)}>
                <DeleteForeverIcon />
              </IconButton>
            </>,
            actionIconsRef
          )}
      </>
      {(() => {
        if (state === State.RenameDialog) {
          return (
            <RenameDialog
              name={name}
              onRename={name => {
                setState(State.Initial);
                onRename(name);
              }}
              onClose={() => {
                setState(State.Initial);
              }}
            />
          );
        }
        if (state === State.DeleteConfirmation) {
          return (
            <DeleteDialog
              onDelete={() => {
                setState(State.Initial);
                onDelete();
              }}
              onClose={() => {
                setState(State.Initial);
              }}
              name={name}
              hash={hash}
            />
          );
        }
        return false;
      })()}
    </>
  );
};

const useStyles = makeStyles({
  listSubheader: {
    display: "flex",
    justifyContent: "space-between"
  }
});

const Identities = () => {
  const classes = useStyles();

  const [identities, setIdentities] = useState<
    Instance<typeof rpc.Identities> | undefined
  >(undefined);
  useEffect(() => {
    let dead = false;
    rpc
      .syncIdentities()
      .then(
        (identities: Instance<typeof rpc.Identities>) =>
          !dead && setIdentities(identities)
      );
    return () => {
      dead = true;
    };
  });

  return identities === undefined ? null : (
    <Container>
      <Card>
        <ListSubheader className={classes.listSubheader}>
          Identities
          <IconButton>
            <AddIcon />
          </IconButton>
        </ListSubheader>
        <Divider />
        <List disablePadding>
          {identities.map(identity => {
            const identityHash = base32
              .encode(
                crypto_generichash(
                  10,
                  new Uint8Array(identity.keyPair.publicSigningKey)
                )
              )
              .toLowerCase();
            return (
              <Identity
                name={identity.name}
                key={identity.id}
                hash={identityHash}
                onDelete={commands.handleIdentity(identity.id).delete}
                onRename={commands.handleIdentity(identity.id).rename}
              />
            );
          })}
        </List>
      </Card>
    </Container>
  );
};

export default Identities;
