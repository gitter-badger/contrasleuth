import React, { useState } from "react";
import { createMuiTheme, makeStyles } from "@material-ui/core/styles";
import { ThemeProvider } from "@material-ui/styles";
import AppBar from "@material-ui/core/AppBar";
import IconButton from "@material-ui/core/IconButton";
import MenuIcon from "@material-ui/icons/Menu";
import Typography from "@material-ui/core/Typography";
import Toolbar from "@material-ui/core/Toolbar";
import Box from "@material-ui/core/Box";
import { HashRouter, Route } from "react-router-dom";

import Inbox from "../pages/Inbox";
import Identities from "../pages/Identities";

import Drawer from "./Drawer";

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

const App: React.FC = () => {
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  return (
    <ThemeProvider theme={theme}>
      <div className={classes.root}>
        <HashRouter>
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
          <Drawer open={open} setOpen={setOpen} />
          <Box m={2} />
          <Route path="/inbox" component={Inbox} />
          <Route path="/identities" component={Identities} />
        </HashRouter>
      </div>
    </ThemeProvider>
  );
};

export default App;
