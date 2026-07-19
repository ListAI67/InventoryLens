import { abortableSleep, RobloxHttpClient } from "./http";
import { endpointPathSegment, endpointUrl, safeRobloxThumbnailUrl } from "./endpoints";
import { parseUserInput, type ParsedUserInput } from "./input";
import { ScanError, type ResolvedUser } from "./types";

interface RobloxUserResponse {
  id: number | string;
  name: string;
  displayName?: string;
  hasVerifiedBadge?: boolean;
}

interface UsernameLookupResponse {
  data?: RobloxUserResponse[];
}

interface ThumbnailResponse {
  data?: Array<{ state?: string; imageUrl?: string }>;
}

export interface ResolveUserOptions {
  client?: RobloxHttpClient;
  signal?: AbortSignal;
  includeThumbnail?: boolean;
}

export interface UserAvatarOptions {
  client?: RobloxHttpClient;
  signal?: AbortSignal;
  pendingRetries?: number;
  pendingRetryDelayMs?: number;
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
}

/** Fetches the user's current full-body avatar render for the graphic builder. */
export async function fetchUserAvatarThumbnail(
  userId: string,
  options: UserAvatarOptions = {},
): Promise<string | undefined> {
  const client = options.client ?? new RobloxHttpClient();
  const pendingRetries = Math.min(4, Math.max(0, Math.trunc(options.pendingRetries ?? 3)));
  const pendingRetryDelayMs = Math.min(2_000, Math.max(0, Math.trunc(options.pendingRetryDelayMs ?? 350)));
  const sleep = options.sleep ?? abortableSleep;
  try {
    for (let attempt = 0; attempt <= pendingRetries; attempt += 1) {
      const response = await client.json<ThumbnailResponse>(
        endpointUrl("thumbnails", "/v1/users/avatar", {
          userIds: userId,
          size: "720x720",
          format: "Png",
          isCircular: "false",
        }),
        { signal: options.signal },
      );
      const result = response.data?.[0];
      if (result?.state === "Completed") return safeRobloxThumbnailUrl(result.imageUrl);
      if (result?.state !== "Pending" || attempt === pendingRetries) return undefined;
      await sleep(Math.min(2_000, pendingRetryDelayMs * 2 ** attempt), options.signal);
    }
    return undefined;
  } catch (error) {
    if (error instanceof ScanError && error.code === "cancelled") throw error;
    return undefined;
  }
}

async function lookupUser(parsed: ParsedUserInput, client: RobloxHttpClient, signal?: AbortSignal): Promise<RobloxUserResponse> {
  if (parsed.kind === "id") {
    return client.json<RobloxUserResponse>(
      endpointUrl("users", `/v1/users/${endpointPathSegment(parsed.value)}`),
      { signal },
    );
  }

  const response = await client.json<UsernameLookupResponse>(
    endpointUrl("users", "/v1/usernames/users"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [parsed.value], excludeBannedUsers: false }),
      signal,
    },
  );
  const user = response.data?.[0];
  if (!user) throw new ScanError("notFound", `Roblox user “${parsed.value}” was not found.`, 404);
  return user;
}

export async function resolveUserInput(input: string, options: ResolveUserOptions = {}): Promise<ResolvedUser> {
  const client = options.client ?? new RobloxHttpClient();
  const parsed = parseUserInput(input);
  const user = await lookupUser(parsed, client, options.signal);
  const resolved: ResolvedUser = {
    id: String(user.id),
    name: user.name,
    displayName: user.displayName || user.name,
    hasVerifiedBadge: Boolean(user.hasVerifiedBadge),
  };

  if (options.includeThumbnail === false) return resolved;

  try {
    const thumbnail = await client.json<ThumbnailResponse>(
      endpointUrl("thumbnails", "/v1/users/avatar-headshot", {
        userIds: resolved.id,
        size: "150x150",
        format: "Png",
        isCircular: "false",
      }),
      { signal: options.signal },
    );
    const result = thumbnail.data?.[0];
    const imageUrl = result?.state === "Completed" ? safeRobloxThumbnailUrl(result.imageUrl) : undefined;
    if (imageUrl) resolved.thumbnailUrl = imageUrl;
  } catch (error) {
    // A missing/moderated headshot should not prevent an otherwise valid scan.
    if (error instanceof ScanError && error.code === "cancelled") throw error;
  }

  return resolved;
}
