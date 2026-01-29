import { App } from "./runtime/App";
import "./styles/global.css";

const root = document.getElementById("app");
if (!root) throw new Error("Missing #app root");

const app = new App(root);
app.start();

