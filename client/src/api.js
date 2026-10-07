// Small fetch wrapper: adds query params and throws the server's error message on failure.
export async function api(path, { params, ...options } = {}) {
  const url = params ? `${path}?${new URLSearchParams(params)}` : path;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || body.error || `Request failed: ${res.status}`);
  return body;
}
