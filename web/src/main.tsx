import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./index.css";
import { App } from "./App";
import { instalarCapturaDeErros } from "./lib/erros";
import { ProvedorToast } from "./ui";

instalarCapturaDeErros();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ProvedorToast>
        <App />
      </ProvedorToast>
    </BrowserRouter>
  </StrictMode>,
);
