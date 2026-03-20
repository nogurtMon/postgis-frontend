"use client";
import { useState, useEffect } from "react";

const DSN_KEY = "pg_dsn";

export function useDsn() {
  const [dsn, setDsnState] = useState<string>("");

  useEffect(() => {
    setDsnState(localStorage.getItem(DSN_KEY) ?? "");
  }, []);

  function setDsn(value: string) {
    setDsnState(value);
    if (value) localStorage.setItem(DSN_KEY, value);
    else localStorage.removeItem(DSN_KEY);
  }

  return { dsn, setDsn };
}
