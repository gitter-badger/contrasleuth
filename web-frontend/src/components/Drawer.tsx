import React, { useEffect, useRef } from "react";
import { makeStyles } from "@material-ui/core/styles";
import SwipeableDrawer from "@material-ui/core/SwipeableDrawer";
import UserIcon from "@material-ui/icons/AccountCircle";
import InboxIcon from "@material-ui/icons/Inbox";
import GroupIcon from "@material-ui/icons/Group";
import ContactsIcon from "@material-ui/icons/Contacts";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemIcon from "@material-ui/core/ListItemIcon";
import ListItemText from "@material-ui/core/ListItemText";
import { Link } from "react-router-dom";

const useStyles = makeStyles({
  drawerIcon: {
    minWidth: "36px"
  }
});

const Drawer = ({
  open,
  setOpen,
  prefixWithoutTrailingSlash = "",
  nameOfCurrentIdentity
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  prefixWithoutTrailingSlash?: string;
  nameOfCurrentIdentity: string;
}) => {
  const classes = useStyles();
  const hashChangeListenerRef = useRef(() => {
    setOpen(false);
  });
  useEffect(() => {
    const hashChangeListener = hashChangeListenerRef.current;
    window.addEventListener("hashchange", hashChangeListener);
    return () => {
      window.removeEventListener("hashchange", hashChangeListener);
    };
  });
  return (
    <SwipeableDrawer
      open={open}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    >
      <List>
        <Link to="/" onClick={() => setOpen(false)}>
          <ListItem button>
            <ListItemIcon className={classes.drawerIcon}>
              <UserIcon />
            </ListItemIcon>
            <ListItemText
              primary="Manage identities"
              secondary={"Logged in as " + nameOfCurrentIdentity}
            />
          </ListItem>
        </Link>
        <Link
          to={prefixWithoutTrailingSlash + "/inbox"}
          onClick={() => setOpen(false)}
        >
          <ListItem button>
            <ListItemIcon className={classes.drawerIcon}>
              <InboxIcon />
            </ListItemIcon>
            <ListItemText primary="Inbox" />
          </ListItem>
        </Link>
        <Link
          to={prefixWithoutTrailingSlash + "/groups"}
          onClick={() => setOpen(false)}
        >
          <ListItem button>
            <ListItemIcon className={classes.drawerIcon}>
              <GroupIcon />
            </ListItemIcon>
            <ListItemText primary="Groups" />
          </ListItem>
        </Link>
        <Link to="./contacts" onClick={() => setOpen(false)}>
          <ListItem button>
            <ListItemIcon className={classes.drawerIcon}>
              <ContactsIcon />
            </ListItemIcon>
            <ListItemText primary="Contacts" />
          </ListItem>
        </Link>
      </List>
    </SwipeableDrawer>
  );
};
export default Drawer;
