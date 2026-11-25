import { useEffect, useState } from "react";
import { jobApi } from "./jobApi";

let cache = null;

function load() {
  if (!cache) {
    cache = Promise.all([jobApi.industries(), jobApi.locations()])
      .then(([industries, locations]) => ({ industries, locations }))
      .catch((error) => {
        cache = null; // cho phép thử lại ở lần mount sau
        throw error;
      });
  }
  return cache;
}

/** Ngành và địa điểm do job-service quản lý; tải một lần rồi dùng chung. */
export function useReferenceData() {
  const [state, setState] = useState({ industries: [], locations: [], loading: true, error: null });

  useEffect(() => {
    let active = true;
    load()
      .then((data) => active && setState({ ...data, loading: false, error: null }))
      .catch((error) => active && setState({ industries: [], locations: [], loading: false, error }));
    return () => {
      active = false;
    };
  }, []);

  return state;
}
