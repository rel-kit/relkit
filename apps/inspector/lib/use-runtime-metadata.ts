"use client";

import { useEffect, useState } from "react";
import type { InspectorObject } from "./api-types";
import { createInspectorClient, INSPECTOR_BACKEND_CONNECTED_EVENT } from "./client";

export interface RuntimeMetadataState {
  readonly value?: InspectorObject;
  readonly loading: boolean;
  readonly failed: boolean;
}

export function useRuntimeMetadata(): RuntimeMetadataState {
  const [state, setState] = useState<RuntimeMetadataState>({ loading: true, failed: false });
  useEffect(() => {
    let disposed = false;
    const api = createInspectorClient();
    const load = (): void => {
      setState((current) => ({ ...current, loading: true, failed: false }));
      void api.runtime().then(
        (value) => !disposed && setState({ value, loading: false, failed: false }),
        () => !disposed && setState({ loading: false, failed: true }),
      );
    };
    load();
    window.addEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, load);
    return () => {
      disposed = true;
      window.removeEventListener(INSPECTOR_BACKEND_CONNECTED_EVENT, load);
    };
  }, []);
  return state;
}
