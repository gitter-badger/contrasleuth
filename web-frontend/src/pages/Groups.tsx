import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Card from "@material-ui/core/Card";
import Divider from "@material-ui/core/Divider";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListSubheader from "@material-ui/core/ListSubheader";
import EditIcon from "@material-ui/icons/Edit";
import InboxIcon from "@material-ui/icons/Inbox";
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
import { Link } from "react-router-dom";
import { crypto_secretbox_KEYBYTES } from "libsodium-wrappers";

import UserProvidedText from "../components/UserProvidedText";
import {
  Identity,
  UnmoderatedGroup,
  Groups,
  syncGroups,
  useModel
} from "../rpc/sync-state-with-server";
import * as commands from "../rpc/rpc-commands";
import { stringifyBinary, parseBinary } from "../utils";

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
      <DialogTitle>Leave this group?</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Messages in this group (<strong>{name}</strong>) won't be sent to your
          inbox anymore.
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onDelete}>Leave</Button>
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
      <DialogTitle>{createNew ? "New group" : "Rename"}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          This name is not shown to anyone else.
        </DialogContentText>
        <form
          onSubmit={event => {
            event.preventDefault();
            if (!inputIsEmpty) onRename(input);
          }}
        >
          <TextField
            autoFocus
            onFocus={event => event.target.select()}
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

const JoinDialog = ({
  onJoin,
  onClose,
  open
}: {
  onJoin: (name: string, key: number[]) => void;
  onClose: () => void;
  open: boolean;
}) => {
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const isEmpty = name.trim() === "" || key.trim() === "";
  const shouldClose = name.trim() === "" && key.trim() === "";
  const parsedKey = [parseBinary(key)].filter(
    parsed =>
      parsed !== undefined && parsed.length === crypto_secretbox_KEYBYTES
  )[0];
  useEffect(() => {
    if (open === false) {
      setName("");
      setKey("");
    }
  }, [open, name, key]);
  return (
    <Dialog open={open} onClose={() => shouldClose && onClose()}>
      <form
        onSubmit={event => {
          event.preventDefault();
          !isEmpty && parsedKey !== undefined && onJoin(name, parsedKey);
        }}
      >
        <DialogTitle>Join group</DialogTitle>
        <DialogContent>
          {!isEmpty && parsedKey === undefined && (
            <DialogContentText>Key is invalid.</DialogContentText>
          )}
          <TextField
            autoFocus
            fullWidth
            onChange={event => {
              setName(event.target.value);
            }}
            label="Name"
            value={name}
            variant="outlined"
          />
          <Box m={2} />
          <TextField
            fullWidth
            onChange={event => {
              setKey(event.target.value);
            }}
            label="Key"
            value={key}
            variant="outlined"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={parsedKey === undefined || isEmpty}>
            Join
          </Button>
        </DialogActions>
      </form>
    </Dialog>
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
    <DialogTitle>Group already joined</DialogTitle>
    <DialogContent>
      <DialogContentText>You are already part of this group.</DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>OK</Button>
    </DialogActions>
  </Dialog>
);

const DetailsDialog = ({
  open,
  onClose,
  name,
  stringifiedKey
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  stringifiedKey: string;
}) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Group details</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Name: <UserProvidedText>{name}</UserProvidedText>
        <br />
        Key: <UserProvidedText>{stringifiedKey}</UserProvidedText>
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Close</Button>
    </DialogActions>
  </Dialog>
);

const Group = ({
  name,
  onDelete,
  onRename,
  stringifiedKey,
  onSelect
}: {
  name: string;
  onDelete: () => void;
  onRename: (name: string) => void;
  stringifiedKey: string;
  onSelect?: () => void;
}) => {
  const [actionIconsRef, setActionIconsRef] = useState<HTMLDivElement | null>(
    null
  );
  enum State {
    Initial,
    RenameDialog,
    DeleteConfirmation,
    Details
  }
  const [state, setState] = useState(State.Initial);
  return (
    <>
      <ListItem
        button
        onClick={() =>
          onSelect === undefined ? setState(State.Details) : onSelect()
        }
      >
        <ListItemText primary={name} />
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
      />
      <DetailsDialog
        open={state === State.Details}
        name={name}
        stringifiedKey={stringifiedKey}
        onClose={() => setState(State.Initial)}
      />
    </>
  );
};

const GroupList = observer(
  ({
    identity,
    hideReturnToInbox = false,
    onSelect
  }: {
    identity: Instance<typeof Identity>;
    hideReturnToInbox?: boolean;
    onSelect?: (group: Instance<typeof UnmoderatedGroup>) => void;
  }) => {
    const groups = useModel<typeof Groups>(() => syncGroups(identity));

    enum State {
      Initial,
      CreateGroup,
      JoinGroup,
      Conflict
    }
    const [state, setState] = useState(State.Initial);

    return groups === undefined ? null : (
      <Container>
        <Card>
          {hideReturnToInbox || (
            <Link to="./inbox">
              <ListItem button>
                <ListItemIcon>
                  <InboxIcon />
                </ListItemIcon>
                <ListItemText>Return to inbox</ListItemText>
              </ListItem>
            </Link>
          )}
          <ListItem button onClick={() => setState(State.JoinGroup)}>
            <ListItemIcon>
              <AddIcon />
            </ListItemIcon>
            <ListItemText>Join group</ListItemText>
          </ListItem>
          <ListItem button onClick={() => setState(State.CreateGroup)}>
            <ListItemIcon>
              <AddIcon />
            </ListItemIcon>
            <ListItemText>Create group</ListItemText>
          </ListItem>
        </Card>
        <Box m={2} />
        <Card>
          <ListSubheader>Groups</ListSubheader>
          <Divider />
          <List disablePadding>
            {groups.length === 0 && (
              <ListItem>
                <ListItemText>You are not part of any group.</ListItemText>
              </ListItem>
            )}
            <RenameDialog
              open={state === State.CreateGroup}
              name=""
              onClose={() => setState(State.Initial)}
              onRename={name => {
                setState(State.Initial);
                commands
                  .handleIdentity(identity.id)
                  .createUnmoderatedGroup(name);
              }}
              createNew
            />
            <JoinDialog
              open={state === State.JoinGroup}
              onClose={() => setState(State.Initial)}
              onJoin={(name, key) => {
                setState(State.Initial);
                commands
                  .handleIdentity(identity.id)
                  .joinUnmoderatedGroup(name, key)
                  .catch(error => {
                    if (!error.isAxiosError) {
                      console.error(error);
                      return;
                    }
                    setState(State.Conflict);
                  });
              }}
            />
            <ConflictDialog
              open={state === State.Conflict}
              onClose={() => setState(State.Initial)}
            ></ConflictDialog>
            {groups.map(group => {
              const stringifiedKey = stringifyBinary(group.key.key);
              return (
                <Group
                  name={group.name}
                  key={stringifiedKey}
                  onDelete={() =>
                    commands
                      .handleIdentity(identity.id)
                      .leaveUnmoderatedGroup(group.key.key)
                  }
                  onRename={name =>
                    commands
                      .handleIdentity(identity.id)
                      .renameUnmoderatedGroup(name, group.key.key)
                  }
                  onSelect={
                    onSelect === undefined ? undefined : () => onSelect(group)
                  }
                  stringifiedKey={stringifiedKey}
                />
              );
            })}
          </List>
        </Card>
      </Container>
    );
  }
);

export default GroupList;
