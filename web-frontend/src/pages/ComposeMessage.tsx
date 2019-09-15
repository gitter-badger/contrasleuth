import React, { useState, useEffect } from "react";
import { Instance } from "mobx-state-tree";
import Container from "@material-ui/core/Container";
import Card from "@material-ui/core/Card";
import Divider from "@material-ui/core/Divider";
import ListSubheader from "@material-ui/core/ListSubheader";
import TextField from "@material-ui/core/TextField";
import { makeStyles } from "@material-ui/styles";
import { Link, Redirect } from "react-router-dom";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import InboxIcon from "@material-ui/icons/Inbox";
import SendIcon from "@material-ui/icons/Send";
import CancelIcon from "@material-ui/icons/Cancel";
import TimerIcon from "@material-ui/icons/Timer";
import TimelapseIcon from "@material-ui/icons/Timelapse";
import Box from "@material-ui/core/Box";
import Button from "@material-ui/core/Button";
import GroupIcon from "@material-ui/icons/Group";
import ContactsIcon from "@material-ui/icons/Contacts";
import Collapse from "@material-ui/core/Collapse";
import ExpandLess from "@material-ui/icons/ExpandLess";
import ExpandMore from "@material-ui/icons/ExpandMore";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import DialogActions from "@material-ui/core/DialogActions";

import UserProvidedText from "../components/UserProvidedText";
import {
  Identity,
  PublicHalf,
  SymmetricKey
} from "../rpc/sync-state-with-server";
import { handleIdentity } from "../rpc/rpc-commands";
import Groups from "./Groups";
import Contacts from "./Contacts";

const useStyles = makeStyles({
  textarea: {
    width: "100%",
    padding: "16px",
    boxSizing: "border-box"
  },
  pageEmbedDialog: {
    width: "100vw",
    margin: 0
  }
});

const ComposeMessage = ({
  identity
}: {
  identity: Instance<typeof Identity>;
}) => {
  const MESSAGE_DRAFT = "message draft";

  const { textarea, pageEmbedDialog } = useStyles();
  enum State {
    Initial,
    SendButtonExpanded,
    SendToGroup,
    SendToPerson,
    RecipientSelected
  }

  const [state, setState] = useState<State>(State.Initial);
  const [recipient, setRecipient] = useState<
    | { type: "symmetric key"; data: Instance<typeof SymmetricKey> }
    | { type: "public half"; data: Instance<typeof PublicHalf> }
    | undefined
  >();
  const [name, setName] = useState<string | undefined>();
  const [expandTimeToLive, setExpandTimeToLive] = useState(false);

  enum ProgressDialogState {
    Initial,
    Sending,
    Sent,
    RedirectToInbox
  }

  const [progressDialogState, setProgressDialogState] = useState(
    ProgressDialogState.Initial
  );

  enum TimeToLive {
    OneDay,
    FourDays,
    OneWeek,
    OneMonth
  }

  const [timeToLive, setTimeToLive] = useState(TimeToLive.FourDays);

  const toString = (timeToLive: TimeToLive) => {
    switch (timeToLive) {
      case TimeToLive.OneDay:
        return "1 day";
      case TimeToLive.FourDays:
        return "4 days";
      case TimeToLive.OneWeek:
        return "7 days";
      case TimeToLive.OneMonth:
        return "28 days";
    }
  };

  const toSeconds = (timeToLive: TimeToLive) => {
    switch (timeToLive) {
      case TimeToLive.OneDay:
        return 86400;
      case TimeToLive.FourDays:
        return 86400 * 4;
      case TimeToLive.OneWeek:
        return 86400 * 7;
      case TimeToLive.OneMonth:
        return 86400 * 28;
    }
  };

  useEffect(() => {
    if (state !== State.RecipientSelected) {
      setRecipient(undefined);
      setName(undefined);
    }
  }, [state, State.RecipientSelected]);

  const [textareaValue, setTextareaValue] = useState(
    localStorage.getItem(MESSAGE_DRAFT) || ""
  );

  useEffect(() => {
    localStorage.setItem(MESSAGE_DRAFT, textareaValue);
  }, [textareaValue]);

  const expandSendButton =
    state !== State.RecipientSelected && state !== State.Initial;

  return (
    <>
      <Container>
        <Card>
          <ListSubheader>Actions</ListSubheader>
          <Divider />
          <Link to="./inbox">
            <ListItem button>
              <ListItemIcon>
                <InboxIcon />
              </ListItemIcon>
              <ListItemText>Return to inbox</ListItemText>
            </ListItem>
          </Link>
        </Card>
        <Box m={2} />
        <Card>
          <ListSubheader>Compose message</ListSubheader>
          <Divider />
          <TextField
            className={textarea}
            placeholder="Write something here"
            multiline
            onChange={event => setTextareaValue(event.target.value)}
            value={textareaValue}
          />
        </Card>
        <Box m={2}></Box>
        <Card>
          <ListItem>
            <ListItemText>
              If the recipient is not online during this period, they will be
              unable to receive this message.
            </ListItemText>
          </ListItem>
          <ListItem>
            <ListItemText>
              The longer the time to live, the longer you will have to wait to
              send the message.
            </ListItemText>
          </ListItem>
          <Divider />
          <ListItem button onClick={() => setExpandTimeToLive(x => !x)}>
            <ListItemIcon>
              <TimelapseIcon />
            </ListItemIcon>
            <ListItemText>Time to live: {toString(timeToLive)}</ListItemText>
            {expandTimeToLive ? <ExpandLess /> : <ExpandMore />}
          </ListItem>
          <Divider />
          <Collapse in={expandTimeToLive} timeout="auto" unmountOnExit>
            <ListItem
              button
              onClick={() => {
                setTimeToLive(TimeToLive.OneDay);
                setExpandTimeToLive(false);
              }}
            >
              <ListItemIcon>
                <TimerIcon />
              </ListItemIcon>
              <ListItemText>{toString(TimeToLive.OneDay)}</ListItemText>
            </ListItem>
            <ListItem
              button
              onClick={() => {
                setTimeToLive(TimeToLive.FourDays);
                setExpandTimeToLive(false);
              }}
            >
              <ListItemIcon>
                <TimerIcon />
              </ListItemIcon>
              <ListItemText>{toString(TimeToLive.FourDays)}</ListItemText>
            </ListItem>
            <ListItem
              button
              onClick={() => {
                setTimeToLive(TimeToLive.OneWeek);
                setExpandTimeToLive(false);
              }}
            >
              <ListItemIcon>
                <TimerIcon />
              </ListItemIcon>
              <ListItemText>{toString(TimeToLive.OneWeek)}</ListItemText>
            </ListItem>
            <ListItem
              button
              onClick={() => {
                setTimeToLive(TimeToLive.OneMonth);
                setExpandTimeToLive(false);
              }}
            >
              <ListItemIcon>
                <TimerIcon />
              </ListItemIcon>
              <ListItemText>{toString(TimeToLive.OneMonth)}</ListItemText>
            </ListItem>
          </Collapse>
        </Card>
        <Box m={2}></Box>
        {state !== State.RecipientSelected && (
          <Card>
            <ListItem
              button
              onClick={() =>
                setState(state =>
                  state === State.SendButtonExpanded
                    ? State.Initial
                    : State.SendButtonExpanded
                )
              }
            >
              <ListItemIcon>
                <SendIcon />
              </ListItemIcon>
              <ListItemText>Send message</ListItemText>
              {expandSendButton ? <ExpandLess /> : <ExpandMore />}
            </ListItem>
            <Divider />
            <Collapse in={expandSendButton} timeout="auto" unmountOnExit>
              <ListItem button onClick={() => setState(State.SendToGroup)}>
                <ListItemIcon>
                  <GroupIcon />
                </ListItemIcon>
                <ListItemText>To a group</ListItemText>
              </ListItem>
              <ListItem button onClick={() => setState(State.SendToPerson)}>
                <ListItemIcon>
                  <ContactsIcon />
                </ListItemIcon>
                <ListItemText>To a person</ListItemText>
              </ListItem>
            </Collapse>
          </Card>
        )}
        {state === State.RecipientSelected && recipient !== undefined && (
          <Card>
            {textareaValue.trim() !== "" && (
              <ListItem
                button
                onClick={() => {
                  setProgressDialogState(ProgressDialogState.Sending);
                  switch (recipient.type) {
                    case "symmetric key":
                      handleIdentity(identity.id)
                        .createPostInUnmoderatedGroup(
                          textareaValue,
                          recipient.data.key,
                          toSeconds(timeToLive)
                        )
                        .then(() =>
                          setProgressDialogState(ProgressDialogState.Sent)
                        );
                      break;
                    case "public half":
                      handleIdentity(identity.id)
                        .sendAsymmetricallyEncryptedMessage(
                          textareaValue,
                          recipient.data.publicEncryptionKey,
                          recipient.data.publicSigningKey,
                          toSeconds(timeToLive)
                        )
                        .then(() =>
                          setProgressDialogState(ProgressDialogState.Sent)
                        );
                  }
                  setTextareaValue("");
                }}
              >
                <ListItemIcon>
                  <SendIcon />
                </ListItemIcon>
                <ListItemText>
                  Send message to{" "}
                  <UserProvidedText fade>{name}</UserProvidedText>
                </ListItemText>
              </ListItem>
            )}
            {textareaValue.trim() === "" && (
              <>
                <ListItem>
                  <ListItemText>
                    Write something to send to{" "}
                    <UserProvidedText fade>{name}</UserProvidedText>
                  </ListItemText>
                </ListItem>
                <Divider />
              </>
            )}
            <ListItem button onClick={() => setState(State.Initial)}>
              <ListItemIcon>
                <CancelIcon />
              </ListItemIcon>
              <ListItemText>Change recipient</ListItemText>
            </ListItem>
          </Card>
        )}
      </Container>
      <Dialog
        open={state === State.SendToGroup}
        onClose={() => setState(State.SendButtonExpanded)}
        classes={{ paper: pageEmbedDialog }}
      >
        <DialogTitle>Choose group</DialogTitle>
        <Box m={1} />
        <Groups
          identity={identity}
          onSelect={group => {
            setState(State.RecipientSelected);
            setRecipient({ type: "symmetric key", data: group.key });
            setName(group.name);
          }}
          hideReturnToInbox
        />
        <Box m={2} />
      </Dialog>
      <Dialog
        open={state === State.SendToPerson}
        onClose={() => setState(State.SendButtonExpanded)}
        classes={{ paper: pageEmbedDialog }}
      >
        <DialogTitle>Choose contact</DialogTitle>
        <Box m={1} />
        <Contacts
          identity={identity}
          onSelect={contact => {
            setState(State.RecipientSelected);
            setRecipient({ type: "public half", data: contact.publicHalf });
            setName(contact.name);
          }}
          hideReturnToInbox
        />
        <Box m={2} />
      </Dialog>
      <Dialog open={progressDialogState === ProgressDialogState.Sending}>
        <DialogTitle>Sending…</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Depending on your device, this could take some time.
          </DialogContentText>
        </DialogContent>
      </Dialog>
      <Dialog
        open={progressDialogState === ProgressDialogState.Sent}
        onClose={() =>
          setProgressDialogState(ProgressDialogState.RedirectToInbox)
        }
      >
        <DialogTitle>Message sent</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Your message has been sent. During the time to live, your encrypted
            message will be sent to random devices in the fervent hope that it
            would reach the recipient. Rest assured, only the recipient can read
            the message.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Link to="./inbox">
            <Button>OK</Button>
          </Link>
        </DialogActions>
      </Dialog>
      {progressDialogState === ProgressDialogState.RedirectToInbox && (
        <Redirect to="./inbox" />
      )}
    </>
  );
};
export default ComposeMessage;
