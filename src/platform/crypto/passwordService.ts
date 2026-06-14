export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, hash] = storedHash.split(":");
  if (algorithm !== "sha256" || !hash) {
    return false;
  }
  return (await sha256(password)) === hash;
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
