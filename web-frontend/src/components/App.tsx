import React, { useState, useEffect } from "react";
import { createMuiTheme, makeStyles } from "@material-ui/core/styles";
import { ThemeProvider } from "@material-ui/styles";
import AppBar from "@material-ui/core/AppBar";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import Typography from "@material-ui/core/Typography";
import Toolbar from "@material-ui/core/Toolbar";
import Box from "@material-ui/core/Box";
import {
  HashRouter,
  Route,
  generatePath,
  match as Match
} from "react-router-dom";
import { Instance } from "mobx-state-tree";

import Inbox from "../pages/Inbox";
import Identities from "../pages/Identities";
import Drawer from "./Drawer";

import * as rpc from "../rpc/sync-state-with-server";

const theme = createMuiTheme({
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
    <>
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
    </>
  );
};

const SetIdentityAppBar = () => {
  const classes = useStyles();
  return (
    <>
      <AppBar position="sticky">
        <Toolbar>
          <Typography variant="h6" className={classes.title}>
            Contrasleuth
          </Typography>
        </Toolbar>
      </AppBar>
      <Box m={2} />
    </>
  );
};

const App: React.FC = () => {
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
  }, []);

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
                      component={() => <Inbox />}
                    />
                    <Route
                      path={match.url + "/groups"}
                      component={() => {
                        console.error("What?!");
                        return null;
                      }}
                    />
                  </>
                )}
              />
            ))}
        </HashRouter>
      </div>
    </ThemeProvider>
  );
};

export default App;
