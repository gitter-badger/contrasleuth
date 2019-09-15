import React, { useState } from "react";
import Card from "@material-ui/core/Card";
import Divider from "@material-ui/core/Divider";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import ListSubheader from "@material-ui/core/ListSubheader";
import Container from "@material-ui/core/Container";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import Box from "@material-ui/core/Box";
import GroupIcon from "@material-ui/icons/Group";
import ContactsIcon from "@material-ui/icons/Contacts";
import UserIcon from "@material-ui/icons/AccountCircle";
import EditIcon from "@material-ui/icons/Edit";
import ExpandLess from "@material-ui/icons/ExpandLess";
import ExpandMore from "@material-ui/icons/ExpandMore";
import Collapse from "@material-ui/core/Collapse";
import { Instance } from "mobx-state-tree";
import { makeStyles } from "@material-ui/core/styles";
import { Link } from "react-router-dom";
import base32 from "hi-base32";
import { observer } from "mobx-react";

import * as state from "../rpc/sync-state-with-server";
import { calculateIdentityHash, stringifyBinary } from "../utils";

const useStyles = makeStyles({
  messageListItem: {
    display: "block"
  }
});

const Message = ({
  message,
  senderName
}: {
  message: Instance<typeof state.Message>;
  senderName?: string;
}) => {
  const classes = useStyles();
  const truncatedMessage =
    message.message.length > 500
      ? message.message.slice(0, 500) + "…"
      : message.message;
  const sender =
    senderName === undefined
      ? `From unknown person: ${calculateIdentityHash(
          message.publicHalf.publicSigningKey,
          message.publicHalf.publicEncryptionKey
        )}`
      : `From: ${senderName}`;
  const [open, setOpen] = useState(false);
  return (
    <>
      <Divider />
      <ListItem
        button
        onClick={() => {
          setOpen(true);
        }}
        className={classes.messageListItem}
      >
        <Typography>From group ???</Typography>
        <ListItemText secondary={sender} />
        <ListItemText secondary={truncatedMessage} />
      </ListItem>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        scroll="paper"
      >
        <DialogTitle>{sender}</DialogTitle>
        <DialogContent dividers>
          <DialogContentText color="textPrimary">
            {message.message}
          </DialogContentText>
        </DialogContent>
        <Divider />
        <DialogActions>
          <Button>Reply</Button>
          <Button
            onClick={() => {
              setOpen(false);
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

const Inbox = ({ identity }: { identity: Instance<typeof state.Identity> }) => {
  const inbox = state.useModel<typeof state.Inbox>(() =>
    state.syncInbox(identity)
  );
  const [expandAddress, setExpandAddress] = useState(false);
  const [expandActions, setExpandActions] = useState(true);
  if (inbox === undefined) return null;
  return (
    <Container>
      <Card>
        <ListItem
          button
          style={{ paddingTop: 0, paddingBottom: 0 }}
          onClick={() => setExpandAddress(x => !x)}
        >
          <ListSubheader style={{ padding: 0 }}>Address</ListSubheader>
          <ListItemIcon>
            {expandAddress ? <ExpandLess /> : <ExpandMore />}
          </ListItemIcon>
        </ListItem>
        <Collapse in={expandAddress} timeout="auto" unmountOnExit>
          <ListItem>
            <Typography>
              {stringifyBinary([
                ...identity.keyPair.publicEncryptionKey,
                ...identity.keyPair.publicSigningKey
              ])}
            </Typography>
          </ListItem>
        </Collapse>
        <ListItem style={{ paddingTop: 0, paddingBottom: 0 }}>
          <ListSubheader style={{ padding: 0 }}>
            80-bit hash:{" "}
            {calculateIdentityHash(
              identity.keyPair.publicSigningKey,
              identity.keyPair.publicEncryptionKey
            )}
          </ListSubheader>
        </ListItem>
        <ListItem
          button
          style={{ paddingTop: 0, paddingBottom: 0 }}
          onClick={() => setExpandActions(x => !x)}
        >
          <ListSubheader style={{ padding: 0 }}>Actions</ListSubheader>
          <ListItemIcon>
            {expandActions ? <ExpandLess /> : <ExpandMore />}
          </ListItemIcon>
        </ListItem>
        <Collapse in={expandActions} timeout="auto" unmountOnExit>
          <Link to="/">
            <ListItem button>
              <ListItemIcon>
                <UserIcon />
              </ListItemIcon>
              <ListItemText primary="Log out" />
            </ListItem>
          </Link>
          <Link to="./groups">
            <ListItem button>
              <ListItemIcon>
                <GroupIcon />
              </ListItemIcon>
              <ListItemText primary="Manage groups" />
            </ListItem>
          </Link>
          <Link to="./contacts">
            <ListItem button>
              <ListItemIcon>
                <ContactsIcon />
              </ListItemIcon>
              <ListItemText primary="Manage contacts" />
            </ListItem>
          </Link>
          <Link to="./compose">
            <ListItem button>
              <ListItemIcon>
                <EditIcon />
              </ListItemIcon>
              <ListItemText primary="Write a message" />
            </ListItem>
          </Link>
        </Collapse>
      </Card>
      <Box m={2} />
      <Card>
        <ListSubheader>Messages</ListSubheader>
        <List disablePadding>
          {inbox.length === 0 && (
            <>
              <Divider />
              <ListItem>
                <ListItemText primary="Nothing here."></ListItemText>
              </ListItem>
            </>
          )}
          {inbox.map(message => (
            <Message
              message={message}
              key={base32.encode(message.signatureHash)}
            />
          ))}
        </List>
      </Card>
    </Container>
  );
};

export default observer(Inbox);
