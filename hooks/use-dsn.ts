"use client";
import { useState, useEffect } from "react";

const DSN_KEY = "pg_dsn";
const TOKEN_KEY = "pg_dsn_token";

function readLS(key: string) {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(key) ?? "";
}

export function useDsn() {
  const [dsn, setDsnState] = useState<string>(() => readLS(DSN_KEY));
  const [token, setTokenState] = useState<string>(() => readLS(TOKEN_KEY));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Re-read on mount in case SSR returned empty strings
    setDsnState(readLS(DSN_KEY));
    setTokenState(readLS(TOKEN_KEY));
    setLoaded(true);
  }, []);

  function setDsn(value: string) {
    setDsnState(value);
    if (value) localStorage.setItem(DSN_KEY, value);
    else localStorage.removeItem(DSN_KEY);
  }

  function setToken(value: string) {
    setTokenState(value);
    if (value) localStorage.setItem(TOKEN_KEY, value);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function clearAll() {
    setDsnState("");
    setTokenState("");
    localStorage.removeItem(DSN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }

  return { dsn, token, setDsn, setToken, clearAll, loaded };
}
