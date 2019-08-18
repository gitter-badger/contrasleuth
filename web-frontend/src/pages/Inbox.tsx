import React from "react";
import Card from "@material-ui/core/Card";
import Divider from "@material-ui/core/Divider";
import List from "@material-ui/core/List";
import ListItem from "@material-ui/core/ListItem";
import ListItemText from "@material-ui/core/ListItemText";
import ListSubheader from "@material-ui/core/ListSubheader";
import Container from "@material-ui/core/Container";
import Box from "@material-ui/core/Box";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";

const Inbox = () => (
  <Container>
    <Card>
      <ListSubheader>Unread</ListSubheader>
      <List disablePadding>
        <Divider />
        <ListItem button>
          <ListItemText
            primary="Lorem, ipsum dolor sit amet consectetur adipisicing elit. Rem, eum!"
            secondary="Lorem ipsum, dolor sit amet consectetur adipisicing elit. Consectetur soluta tempora error at repellat eum, necessitatibus nisi modi fugit expedita!"
          />
        </ListItem>
        <Divider />
        <ListItem button>
          <ListItemText
            primary="Lorem, ipsum dolor sit amet consectetur adipisicing elit. Rem, eum!"
            secondary="Lorem ipsum, dolor sit amet consectetur adipisicing elit. Consectetur soluta tempora error at repellat eum, necessitatibus nisi modi fugit expedita!"
          />
        </ListItem>
      </List>
    </Card>
    <Box m={2} />
    <Card>
      <ListSubheader>Other messages</ListSubheader>
      <List disablePadding>
        <Divider />
        <ListItem button>
          <ListItemText
            primary="Lorem, ipsum dolor sit amet consectetur adipisicing elit. Rem, eum!"
            secondary="Lorem ipsum, dolor sit amet consectetur adipisicing elit. Consectetur soluta tempora error at repellat eum, necessitatibus nisi modi fugit expedita!"
          />
        </ListItem>
        <Divider />
        <ListItem button>
          <ListItemText
            primary="Lorem, ipsum dolor sit amet consectetur adipisicing elit. Rem, eum!"
            secondary="Lorem ipsum, dolor sit amet consectetur adipisicing elit. Consectetur soluta tempora error at repellat eum, necessitatibus nisi modi fugit expedita!"
          />
        </ListItem>
      </List>
    </Card>
    <Dialog open scroll="paper">
      <Box p={3}>
        <Typography variant="h6">
          This is an example of speech synthesis in English.
        </Typography>
        <Typography>Posted by: xxxxxxxxxxxxxxxx</Typography>
      </Box>
      <DialogContent dividers>
        <DialogContentText color="textPrimary">
          {"This is an example of speech synthesis in English. ".repeat(100)}
        </DialogContentText>
      </DialogContent>
      <Divider />
      <DialogActions>
        <Button>Reply</Button>
        <Button>Close</Button>
      </DialogActions>
    </Dialog>
  </Container>
);

export default Inbox;
