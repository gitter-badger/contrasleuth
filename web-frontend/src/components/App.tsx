import React, { useState, useEffect } from "react";
import { createMuiTheme, makeStyles } from "@material-ui/core/styles";
import { ThemeProvider } from "@material-ui/styles";
import AppBar from "@material-ui/core/AppBar";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import Typography from "@material-ui/core/Typography";
import Toolbar from "@material-ui/core/Toolbar";
import Box from "@material-ui/core/Box";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogContentText from "@material-ui/core/DialogContentText";
import {
  HashRouter,
  Route,
  generatePath,
  match as Match
} from "react-router-dom";
import { observer } from "mobx-react";

import Inbox from "../pages/Inbox";
import Identities from "../pages/Identities";
import Groups from "../pages/Groups";
import Contacts from "../pages/Contacts";
import Drawer from "./Drawer";
import ComposeMessage from "../pages/ComposeMessage";

import * as state from "../rpc/sync-state-with-server";

const theme = createMuiTheme({
  typography: {
    fontFamily: "'Fira Sans'"
  },
  palette: {
    primary: { main: "#424242" },
    secondary: { main: "#ffffff" }
  }
});

const appBarTheme = createMuiTheme({
  typography: {
    fontFamily: "'Fira Sans'"
  },
  palette: {
    primary: { main: "#ffffff" },
    secondary: { main: "#ffffff" }
  }
});

const useStyles = makeStyles(theme => ({
  root: {
    flexGrow: 1
  },
  menuButton: {
    marginRight: theme.spacing(2)
  },
  title: {
    flexGrow: 1
  }
}));

const NormalAppBar = ({
  nameOfCurrentIdentity,
  prefixWithoutTrailingSlash
}: {
  nameOfCurrentIdentity: string;
  prefixWithoutTrailingSlash?: string;
}) => {
  const [open, setOpen] = useState(false);
  const classes = useStyles();
  return (
    <ThemeProvider theme={appBarTheme}>
      <AppBar position="sticky">
        <Toolbar>
          <IconButton
            onClick={() => setOpen(true)}
            edge="start"
            className={classes.menuButton}
            color="inherit"
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" className={classes.title}>
            Contrasleuth
          </Typography>
        </Toolbar>
      </AppBar>
      <Drawer
        open={open}
        setOpen={setOpen}
        nameOfCurrentIdentity={nameOfCurrentIdentity}
        prefixWithoutTrailingSlash={prefixWithoutTrailingSlash}
      />
      <Box m={2} />
    </ThemeProvider>
  );
};

const SetIdentityAppBar = () => {
  const classes = useStyles();
  return (
    <ThemeProvider theme={appBarTheme}>
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" className={classes.title}>
            Contrasleuth
          </Typography>
        </Toolbar>
      </AppBar>
      <Box m={2} />
    </ThemeProvider>
  );
};

const App: React.FC = observer(() => {
  const classes = useStyles();

  const identities = state.useModel<typeof state.Identities>(() =>
    state.syncIdentities()
  );

  return (
    <ThemeProvider theme={theme}>
      <div className={classes.root}>
        <HashRouter>
          <Route
            path="/"
            exact
            component={() => (
              <>
                <SetIdentityAppBar />
                <Identities identities={identities} />
              </>
            )}
          />
          {identities &&
            identities.map(identity => (
              <Route
                key={identity.id}
                path={generatePath("/user/:id", { id: identity.id })}
                component={({ match }: { match: Match }) => (
                  <>
                    <NormalAppBar
                      nameOfCurrentIdentity={identity.name}
                      prefixWithoutTrailingSlash={match.url}
                    />
                    <Route
                      path={match.url + "/inbox"}
                      component={() => <Inbox identity={identity} />}
                    />
                    <Route
                      path={match.url + "/groups"}
                      component={() => <Groups identity={identity} />}
                    />
                    <Route
                      path={match.url + "/contacts"}
                      component={() => <Contacts identity={identity} />}
                    />
                    <Route
                      path={match.url + "/compose"}
                      component={() => <ComposeMessage identity={identity} />}
                    />
                  </>
                )}
              />
            ))}
          <Box m={2} />
        </HashRouter>
      </div>
    </ThemeProvider>
  );
});

const Loading = () => {
  // The dialog shows when 500 milliseconds have elapsed and the server is not ready yet.
  // This is to prevent flicker when (a) the server is already running or (b) the device
  // is powerful.
  const [ready, setReady] = useState(false);
  const [timeoutExpired, setTimeoutExpired] = useState(false);

  useEffect(() => {
    state.waitUntilServerReady().then(() => setReady(true));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => setTimeoutExpired(true), 500);
    return () => clearTimeout(timeout);
  }, []);

  const loadingDialog = (
    <ThemeProvider theme={theme}>
      <Dialog open={!ready && timeoutExpired}>
        <DialogTitle>Loading…</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Depending on your device, this could take some time.
          </DialogContentText>
        </DialogContent>
      </Dialog>
    </ThemeProvider>
  );

  if (!ready) {
    return loadingDialog;
  }

  return (
    <>
      {loadingDialog}
      <App />
    </>
  );
};

export default Loading;
