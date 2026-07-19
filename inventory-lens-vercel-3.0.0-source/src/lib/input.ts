import { ScanError } from "./types";

export type ParsedUserInput =
  | { kind: "id"; value: string }
  | { kind: "username"; value: string };

const USERNAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9_]{1,18}[A-Za-z0-9])?$/;

function parseProfileUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  const host = url.hostname.toLowerCase();
  if (host !== "roblox.com" && !host.endsWith(".roblox.com")) return undefined;
  const match = url.pathname.match(/^\/users\/(\d+)\/profile\/?$/i);
  return match?.[1];
}

/** Parses a username, numeric user ID, or a canonical Roblox profile URL. */
export function parseUserInput(input: string): ParsedUserInput {
  const value = input.trim();
  if (!value) throw new ScanError("invalidInput", "Enter a Roblox username, user ID, or profile URL.");

  const profileId = parseProfileUrl(value);
  if (profileId) return { kind: "id", value: profileId };
  if (/^\d+$/.test(value)) return { kind: "id", value };

  const username = value.startsWith("@") ? value.slice(1) : value;
  if (
    username.length < 3 ||
    username.length > 20 ||
    !USERNAME_PATTERN.test(username) ||
    (username.match(/_/g)?.length ?? 0) > 1
  ) {
    throw new ScanError("invalidInput", "That is not a valid Roblox username, user ID, or profile URL.");
  }

  return { kind: "username", value: username };
}
