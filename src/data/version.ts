export async function loadVersion(): Promise<string> {
  try {
    const res = await fetch("/data/version.json", { cache: "no-store" });
    if (!res.ok) return "0.01";
    const json = (await res.json()) as { version?: string };
    return typeof json.version === "string" ? json.version : "0.01";
  } catch {
    return "0.01";
  }
}

