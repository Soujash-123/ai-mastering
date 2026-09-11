"use client";

import React, { createContext, useContext, useEffect } from "react";

export type UIMode = "neon";

interface UIContextType {
  uiMode: UIMode;
  setUiMode: (mode: UIMode) => void;
}

const UIContext = createContext<UIContextType>({
  uiMode: "neon",
  setUiMode: () => {},
});

export function UIProvider({ children }: { children: React.ReactNode }) {
  // Always neon — no toggle, no localStorage
  useEffect(() => {
    document.documentElement.classList.add("theme-neon");
    document.documentElement.classList.remove("theme-aurora");
    document.body.style.backgroundColor = "#09090b";
  }, []);

  return (
    <UIContext.Provider value={{ uiMode: "neon", setUiMode: () => {} }}>
      {children}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
