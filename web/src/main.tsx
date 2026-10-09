import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { App } from "./App";
import { instalarCapturaDeErros } from "./lib/erros";
import { vigiarDadosOffline } from "./lib/offline";
import { registrarServiceWorker } from "./lib/sw";
import { ProvedorToast } from "./ui";

instalarCapturaDeErros();
vigiarDadosOffline();
registrarServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorToast>
        <App />
      </ProvedorToast>
    </BrowserRouter>
  </StrictMode>,
);
