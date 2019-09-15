import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Card from "@material-ui/core/Card";
import Collapse from "@material-ui/core/Collapse";
import Divider from "@material-ui/core/Divider";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListSubheader from "@material-ui/core/ListSubheader";
import InboxIcon from "@material-ui/icons/Inbox";
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
import Box from "@material-ui/core/Box";
import { observer } from "mobx-react";
import {
  crypto_box_PUBLICKEYBYTES,
  crypto_sign_PUBLICKEYBYTES
} from "libsodium-wrappers";
import { Link } from "react-router-dom";

import UserProvidedText from "../components/UserProvidedText";
import {
  useModel,
  Identity,
  Contacts,
  Contact as MSTContact,
  syncContacts
} from "../rpc/sync-state-with-server";
import * as commands from "../rpc/rpc-commands";
import { calculateIdentityHash, stringifyBinary, parseBinary } from "../utils";

const DeleteDialog = ({
  onClose,
  onDelete,
  name,
  open
}: {
  onClose: () => void;
  onDelete: () => void;
  name: string;
  open: boolean;
}) => {
  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>Delete this contact?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Do you want to delete this contact (<strong>{name}</strong>)?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onDelete}>Delete</Button>
      </DialogActions>
    </Dialog>
  );
};

const EditDialog = ({
  createNew = false,
  name = "",
  publicSigningKey,
  publicEncryptionKey,
  onEdit,
  open,
  onClose
}: {
  open: boolean;
  createNew?: boolean;
  onEdit: (
    name: string,
    publicSigningKey: number[],
    publicEncryptionKey: number[]
  ) => void;
  name: string;
  publicSigningKey?: number[];
  publicEncryptionKey?: number[];
  onClose: () => void;
}) => {
  const initialAddress =
    publicEncryptionKey === undefined || publicSigningKey === undefined
      ? ""
      : stringifyBinary([...publicEncryptionKey, ...publicSigningKey]);
  const [newName, setName] = useState(name);
  const [address, setAddress] = useState(initialAddress);
  useEffect(() => {
    if (open === false) {
      setName(name);
      setAddress(initialAddress);
    }
  }, [open, initialAddress, name]);
  const amalgamation = parseBinary(address);
  const isValid =
    newName.trim() !== "" &&
    amalgamation !== undefined &&
    amalgamation.length ===
      crypto_box_PUBLICKEYBYTES + crypto_sign_PUBLICKEYBYTES;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (createNew && newName.trim() !== "") return;
        if (address !== initialAddress) return;
        onClose();
      }}
    >
      <form
        onSubmit={event => {
          event.preventDefault();
          if (amalgamation !== undefined) {
            const publicEncryptionKey = amalgamation.slice(
              0,
              crypto_box_PUBLICKEYBYTES
            );
            const publicSigningKey = amalgamation.slice(
              crypto_box_PUBLICKEYBYTES,
              amalgamation.length
            );
            onEdit(newName, publicSigningKey, publicEncryptionKey);
          }
        }}
      >
        <DialogTitle>{createNew ? "Add contact" : "Edit contact"}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            onFocus={event => !createNew && event.target.select()}
            fullWidth
            onChange={event => setName(event.target.value)}
            label="Name"
            value={newName}
            variant="outlined"
          />
          <Box m={2} />
          <TextField
            onFocus={event => !createNew && event.target.select()}
            fullWidth
            onChange={event => setAddress(event.target.value)}
            label="Address"
            value={address}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button disabled={!isValid} type="submit">
            {createNew ? "Add contact" : "Confirm"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

const DetailsDialog = ({
  name,
  publicSigningKey,
  publicEncryptionKey,
  onEdit,
  onClose,
  open
}: {
  name: string;
  publicEncryptionKey: number[];
  publicSigningKey: number[];
  onEdit: () => void;
  onClose: () => void;
  open: boolean;
}) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Contact details</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Name: <UserProvidedText>{name}</UserProvidedText>
        <br />
        80-bit hash:{" "}
        <UserProvidedText>
          {calculateIdentityHash(publicSigningKey, publicEncryptionKey)}
        </UserProvidedText>
        <br />
        Address:{" "}
        <UserProvidedText>
          {stringifyBinary([...publicEncryptionKey, ...publicSigningKey])}
        </UserProvidedText>
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onEdit}>Edit</Button>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
);

const Contact = ({
  name,
  onDelete,
  onEdit,
  publicSigningKey,
  publicEncryptionKey,
  onSelect
}: {
  name: string;
  onDelete: () => void;
  onEdit: (
    name: string,
    publicSigningKey: number[],
    publicEncryptionKey: number[]
  ) => void;
  publicSigningKey: number[];
  publicEncryptionKey: number[];
  onSelect?: () => void;
}) => {
  const [actionIconsRef, setActionIconsRef] = useState<HTMLDivElement | null>(
    null
  );
  enum State {
    Initial,
    EditDialog,
    DeleteConfirmation,
    Details
  }
  const [state, setState] = useState(State.Initial);
  const hash = calculateIdentityHash(publicSigningKey, publicEncryptionKey);
  return (
    <>
      <ListItem
        button
        onClick={() =>
          onSelect === undefined ? setState(State.Details) : onSelect()
        }
      >
        <ListItemText primary={name} secondary={hash} />
        <div ref={setActionIconsRef} />
      </ListItem>
      <>
        {actionIconsRef &&
          createPortal(
            <div style={{ display: "flex" }}>
              <IconButton
                onClick={() => {
                  setState(State.EditDialog);
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
      />
      <EditDialog
        open={state === State.EditDialog}
        onEdit={(name, publicSigningKey, publicEncryptionKey) => {
          onEdit(name, publicSigningKey, publicEncryptionKey);
          setState(State.Initial);
        }}
        name={name}
        publicSigningKey={publicSigningKey}
        publicEncryptionKey={publicEncryptionKey}
        onClose={() => setState(State.Initial)}
      />
      <DetailsDialog
        open={state === State.Details}
        name={name}
        publicSigningKey={publicSigningKey}
        publicEncryptionKey={publicEncryptionKey}
        onEdit={() => setState(State.EditDialog)}
        onClose={() => setState(State.Initial)}
      />
    </>
  );
};

const ConflictDialog = ({
  open,
  onClose
}: {
  open: boolean;
  onClose: () => void;
}) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Contact already added</DialogTitle>
    <DialogContent>
      <DialogContentText>
        You have already added this contact.
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>OK</Button>
    </DialogActions>
  </Dialog>
);

const ContactList = observer(
  ({
    identity,
    onSelect,
    hideReturnToInbox = false
  }: {
    identity: Instance<typeof Identity>;
    onSelect?: (contact: Instance<typeof MSTContact>) => void;
    hideReturnToInbox?: boolean;
  }) => {
    enum State {
      Initial,
      AddContact,
      Conflict
    }
    const [state, setState] = useState(State.Initial);
    const contacts = useModel<typeof Contacts>(() => syncContacts(identity));

    if (contacts === undefined) return null;

    return (
      <>
        <Container>
          <Card>
            <ListSubheader>Actions</ListSubheader>
            <Divider />
            <List disablePadding>
              <Collapse in={!hideReturnToInbox}>
                <Link to="./inbox">
                  <ListItem button>
                    <ListItemIcon>
                      <InboxIcon />
                    </ListItemIcon>
                    <ListItemText>Return to inbox</ListItemText>
                  </ListItem>
                </Link>
              </Collapse>
              <ListItem button onClick={() => setState(State.AddContact)}>
                <ListItemIcon>
                  <AddIcon />
                </ListItemIcon>
                <ListItemText>Add contact</ListItemText>
              </ListItem>
            </List>
          </Card>
          <Box m={2} />
          <Card>
            <ListSubheader>Contacts</ListSubheader>
            <Divider />
            <List disablePadding>
              {contacts.length === 0 && (
                <>
                  <ListItem>
                    <ListItemText>Your contact list is empty.</ListItemText>
                    <Divider />
                  </ListItem>
                </>
              )}
              {contacts.map(contact => (
                <Contact
                  key={contact.id}
                  name={contact.name}
                  onDelete={() =>
                    commands
                      .handleIdentity(identity.id)
                      .deleteContact(contact.id)
                  }
                  onEdit={(name, publicSigningKey, publicEncryptionKey) =>
                    commands
                      .handleIdentity(identity.id)
                      .editContact(
                        contact.id,
                        name,
                        publicSigningKey,
                        publicEncryptionKey
                      )
                  }
                  publicSigningKey={contact.publicHalf.publicSigningKey}
                  publicEncryptionKey={contact.publicHalf.publicEncryptionKey}
                  onSelect={
                    onSelect === undefined ? undefined : () => onSelect(contact)
                  }
                />
              ))}
            </List>
          </Card>
        </Container>
        <EditDialog
          createNew
          name=""
          open={state === State.AddContact}
          onEdit={(name, publicSigningKey, publicEncryptionKey) => {
            commands
              .handleIdentity(identity.id)
              .addContact(name, publicSigningKey, publicEncryptionKey)
              .catch(error => {
                if (error.isAxiosError) {
                  setState(State.Conflict);
                  return;
                }
                console.error(error);
              });
            setState(State.Initial);
          }}
          onClose={() => setState(State.Initial)}
        />
        <ConflictDialog
          open={state === State.Conflict}
          onClose={() => setState(State.Initial)}
        />
      </>
    );
  }
);

export default ContactList;
