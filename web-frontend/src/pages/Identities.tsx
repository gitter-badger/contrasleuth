import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { generatePath } from "react-router-dom";
import Card from "@material-ui/core/Card";
import Divider from "@material-ui/core/Divider";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListSubheader from "@material-ui/core/ListSubheader";
import EditIcon from "@material-ui/icons/Edit";
import DeleteForeverIcon from "@material-ui/icons/DeleteForever";
import AddIcon from "@material-ui/icons/Add";
import Container from "@material-ui/core/Container";
import IconButton from "@material-ui/core/IconButton";
import { Instance } from "mobx-state-tree";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogTitle from "@material-ui/core/DialogTitle";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import { makeStyles } from "@material-ui/core/styles";
import { observer } from "mobx-react";
import { Redirect } from "react-router-dom";

import * as state from "../rpc/sync-state-with-server";
import * as commands from "../rpc/rpc-commands";
import { calculateIdentityHash } from "../utils";

const DeleteDialog = ({
  onClose,
  onDelete,
  hash,
  name,
  open
}: {
  onClose: () => void;
  onDelete: () => void;
  hash: string;
  name: string;
  open: boolean;
}) => {
  const [input, setInput] = useState("");
  const typedIdentityHash = input.trim().toLowerCase() === hash.toLowerCase();
  return (
    <Dialog open={open} onClose={onClose}>
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
            autoFocus
            placeholder={hash}
            fullWidth
            margin="normal"
            onChange={event => {
              setInput(event.target.value);
            }}
            value={input}
            variant="outlined"
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
  onClose,
  createNew = false,
  open
}: {
  name: string;
  onRename: (name: string) => void;
  onClose: () => void;
  createNew?: boolean;
  open: boolean;
}) => {
  const [input, setInput] = useState(name);
  const inputIsEmpty = input.replace(/\s/g, "") === "";
  useEffect(() => {
    if (open === false) {
      setInput(name);
    }
  }, [open, name]);
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{createNew ? "New identity" : "Rename"}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This name is not shown to anyone else. A random alphanumeric string
          (which is the 80-bit hash of this identity) will be shown to others in
          place of this name, similar to how cell phones work.
        </DialogContentText>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (!inputIsEmpty) onRename(input);
          }}
        >
          <TextField
            autoFocus
            onFocus={event => !createNew && event.target.select()}
            fullWidth
            onChange={event => {
              setInput(event.target.value);
            }}
            placeholder="Name"
            value={input}
            variant="outlined"
          />
        </form>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={() => onRename(input)} disabled={inputIsEmpty}>
          {createNew ? "Create" : "Rename"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const Identity = ({
  name,
  hash,
  onDelete,
  onRename,
  to
}: {
  name: string;
  hash: string;
  onDelete: () => void;
  onRename: (name: string) => void;
  to: string;
}) => {
  const [actionIconsRef, setActionIconsRef] = useState<HTMLDivElement | null>(
    null
  );
  enum State {
    Initial,
    RenameDialog,
    DeleteConfirmation,
    Redirect
  }
  const [state, setState] = useState(State.Initial);
  return (
    <>
      <ListItem button onClick={() => setState(State.Redirect)}>
        <ListItemText primary={name} secondary={hash} />
        <div ref={setActionIconsRef} />
      </ListItem>
      <>
        {actionIconsRef &&
          createPortal(
            <div style={{ display: "flex" }}>
              <IconButton
                onClick={() => {
                  setState(State.RenameDialog);
                }}
              >
                <EditIcon />
              </IconButton>
              <IconButton
                onClick={() => {
                  setState(State.DeleteConfirmation);
                }}
              >
                <DeleteForeverIcon />
              </IconButton>
            </div>,
            actionIconsRef
          )}
      </>
      <RenameDialog
        open={state === State.RenameDialog}
        name={name}
        onRename={name => {
          setState(State.Initial);
          onRename(name);
        }}
        onClose={() => {
          setState(State.Initial);
        }}
      />
      <DeleteDialog
        open={state === State.DeleteConfirmation}
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
      {state === State.Redirect && <Redirect to={to} />}
    </>
  );
};

const useStyles = makeStyles({
  listSubheader: {
    display: "flex",
    justifyContent: "space-between"
  }
});

const Identities = observer(
  ({
    identities
  }: {
    identities: Instance<typeof state.Identities> | undefined;
  }) => {
    const [createIdentity, setCreateIdentity] = useState(false);

    const classes = useStyles();

    return identities === undefined ? null : (
      <Container>
        <Card>
          <ListSubheader className={classes.listSubheader}>
            Identities
            <IconButton onClick={() => setCreateIdentity(true)}>
              <AddIcon />
            </IconButton>
          </ListSubheader>
          <Divider />
          <List disablePadding>
            {identities.length === 0 && (
              <>
                <ListItem>
                  <ListItemText>
                    There are no identities in here. Create an identity to use
                    Contrasleuth.
                  </ListItemText>
                </ListItem>
                <Divider />
                <ListItem button onClick={() => setCreateIdentity(true)}>
                  <ListItemIcon>
                    <AddIcon />
                  </ListItemIcon>
                  <ListItemText>Create a new identity</ListItemText>
                </ListItem>
              </>
            )}
            <RenameDialog
              open={createIdentity}
              name=""
              onClose={() => setCreateIdentity(false)}
              onRename={name => {
                setCreateIdentity(false);
                commands.createIdentity(name);
              }}
              createNew
            />
            {identities.length > 0 && (
              <>
                <ListItem>
                  <ListItemText>
                    Select an identity below to log in.
                  </ListItemText>
                </ListItem>
                <Divider />
              </>
            )}
            {identities.map(identity => {
              const identityHash = calculateIdentityHash(
                identity.keyPair.publicSigningKey,
                identity.keyPair.publicEncryptionKey
              );
              return (
                <Identity
                  name={identity.name}
                  key={identity.id}
                  hash={identityHash}
                  onDelete={commands.handleIdentity(identity.id).delete}
                  onRename={commands.handleIdentity(identity.id).rename}
                  to={generatePath("/user/:id/inbox", { id: identity.id })}
                />
              );
            })}
          </List>
        </Card>
      </Container>
    );
  }
);

export default Identities;
