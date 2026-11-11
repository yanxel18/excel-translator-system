let activeRequests = 0;
const listeners = new Set<() => void>();

function publish() {
  for (const listener of listeners) listener();
}

export function beginTrackedRequest(): () => void {
  activeRequests += 1;
  publish();

  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    activeRequests = Math.max(0, activeRequests - 1);
    publish();
  };
}

export function subscribeToRequests(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function hasActiveRequests(): boolean {
  return activeRequests > 0;
}
