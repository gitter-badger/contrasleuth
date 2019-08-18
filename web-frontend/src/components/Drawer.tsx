import React, { useEffect, useRef } from "react";
import { makeStyles } from "@material-ui/core/styles";
import SwipeableDrawer from "@material-ui/core/SwipeableDrawer";
import UserIcon from "@material-ui/icons/AccountCircle";
import WiFiIcon from "@material-ui/icons/Wifi";
import InboxIcon from "@material-ui/icons/Inbox";
import GroupIcon from "@material-ui/icons/Group";
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
  setOpen
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
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
        <Link to="/identities">
          <ListItem button>
            <ListItemIcon className={classes.drawerIcon}>
              <UserIcon />
            </ListItemIcon>
            <ListItemText
              primary="Manage identities"
              secondary="Logged in as 60794"
            />
          </ListItem>
        </Link>
        <ListItem>
          <ListItemIcon className={classes.drawerIcon}>
            <WiFiIcon />
          </ListItemIcon>
          <ListItemText secondary="Connected to 10 peers (4 Internet, 2 Wi-Fi, 4 Bluetooth)" />
        </ListItem>
        <Link to="/inbox">
          <ListItem button>
            <ListItemIcon className={classes.drawerIcon}>
              <InboxIcon />
            </ListItemIcon>
            <ListItemText primary="Inbox" />
          </ListItem>
        </Link>
        <Link to="/">
          <ListItem button>
            <ListItemIcon className={classes.drawerIcon}>
              <GroupIcon />
            </ListItemIcon>
            <ListItemText primary="Groups" />
          </ListItem>
        </Link>
      </List>
    </SwipeableDrawer>
  );
};
export default Drawer;
