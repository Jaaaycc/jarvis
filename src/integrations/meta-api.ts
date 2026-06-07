/**
 * Meta Graph API Client
 *
 * Handles Facebook Page + Instagram Graph API calls:
 *   - Publish text/photo/video posts to Facebook Page
 *   - Publish photos/Reels to Instagram
 *   - Read and reply to Facebook comments
 *   - Read and reply to Facebook Page Inbox (DMs)
 *   - Read and reply to Instagram comments and DMs
 *   - Fetch Instagram account ID linked to a Facebook Page
 *
 * All credentials come from config — never hardcoded.
 * Uses raw fetch() — no SDK dependency.
 */

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

// ── Types ──────────────────────────────────────────────────────────────────

export type MetaConfig = {
  pageId: string;
  pageAccessToken: string;
  adAccountId?: string;
  businessId?: string;
};

export type FBPost = {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
};

export type FBComment = {
  id: string;
  message: string;
  from?: { id: string; name: string };
  created_time: string;
};

export type FBConversation = {
  id: string;
  updated_time: string;
  participants: { name: string; id: string }[];
};

export type FBMessage = {
  id: string;
  message: string;
  from: { id: string; name: string };
  created_time: string;
};

export type IGAccount = {
  id: string;
  username: string;
  name: string;
};

export type IGMedia = {
  id: string;
  caption?: string;
  media_type: string;
  timestamp: string;
  permalink?: string;
};

export type IGComment = {
  id: string;
  text: string;
  username?: string;
  timestamp: string;
};

// ── Helpers ────────────────────────────────────────────────────────────────

async function graphGet(
  path: string,
  token: string,
  params: Record<string, string> = {}
): Promise<any> {
  const url = new URL(`${GRAPH_BASE}/${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const resp = await fetch(url.toString());
  const json = await resp.json() as any;

  if (!resp.ok || json.error) {
    throw new Error(`[meta-api] GET ${path} failed: ${JSON.stringify(json.error ?? json)}`);
  }

  return json;
}

async function graphPost(
  path: string,
  token: string,
  body: Record<string, any>
): Promise<any> {
  const url = `${GRAPH_BASE}/${path}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const json = await resp.json() as any;

  if (!resp.ok || json.error) {
    throw new Error(`[meta-api] POST ${path} failed: ${JSON.stringify(json.error ?? json)}`);
  }

  return json;
}

// ── Facebook Page ──────────────────────────────────────────────────────────

/** Publish a text post (optionally with a photo URL) to the Facebook Page. */
export async function fbPublishPost(
  cfg: MetaConfig,
  message: string,
  photoUrl?: string
): Promise<{ id: string }> {
  const endpoint = photoUrl ? `${cfg.pageId}/photos` : `${cfg.pageId}/feed`;
  const body: Record<string, any> = { message };
  if (photoUrl) body.url = photoUrl;

  return graphPost(endpoint, cfg.pageAccessToken, body);
}

/** Publish a video post to the Facebook Page. */
export async function fbPublishVideo(
  cfg: MetaConfig,
  videoUrl: string,
  description: string,
  title?: string
): Promise<{ id: string }> {
  return graphPost(`${cfg.pageId}/videos`, cfg.pageAccessToken, {
    file_url: videoUrl,
    description,
    ...(title ? { title } : {}),
  });
}

/** Get recent posts from the Facebook Page. */
export async function fbGetRecentPosts(
  cfg: MetaConfig,
  limit = 10
): Promise<FBPost[]> {
  const data = await graphGet(`${cfg.pageId}/feed`, cfg.pageAccessToken, {
    fields: 'id,message,created_time,permalink_url',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Get comments on a Facebook post. */
export async function fbGetComments(
  cfg: MetaConfig,
  postId: string,
  limit = 25
): Promise<FBComment[]> {
  const data = await graphGet(`${postId}/comments`, cfg.pageAccessToken, {
    fields: 'id,message,from,created_time',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Reply to a Facebook comment. */
export async function fbReplyToComment(
  cfg: MetaConfig,
  commentId: string,
  message: string
): Promise<{ id: string }> {
  return graphPost(`${commentId}/comments`, cfg.pageAccessToken, { message });
}

/** Get Page Inbox conversations (DMs). */
export async function fbGetConversations(
  cfg: MetaConfig,
  limit = 20
): Promise<FBConversation[]> {
  const data = await graphGet(`${cfg.pageId}/conversations`, cfg.pageAccessToken, {
    fields: 'id,updated_time,participants',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Get messages within a conversation. */
export async function fbGetMessages(
  cfg: MetaConfig,
  conversationId: string,
  limit = 10
): Promise<FBMessage[]> {
  const data = await graphGet(`${conversationId}/messages`, cfg.pageAccessToken, {
    fields: 'id,message,from,created_time',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Send a reply DM to a Page conversation. */
export async function fbReplyToDM(
  cfg: MetaConfig,
  recipientPsid: string,
  message: string
): Promise<{ recipient_id: string; message_id: string }> {
  return graphPost(`${cfg.pageId}/messages`, cfg.pageAccessToken, {
    recipient: { id: recipientPsid },
    message: { text: message },
  });
}

// ── Instagram ──────────────────────────────────────────────────────────────

/** Get the Instagram Business Account linked to the Facebook Page. */
export async function igGetAccount(cfg: MetaConfig): Promise<IGAccount | null> {
  try {
    const data = await graphGet(cfg.pageId, cfg.pageAccessToken, {
      fields: 'instagram_business_account{id,username,name}',
    });
    const iga = data.instagram_business_account;
    if (!iga) return null;
    return { id: iga.id, username: iga.username, name: iga.name };
  } catch {
    return null;
  }
}

/** Publish a photo post to Instagram (two-step: create container → publish). */
export async function igPublishPhoto(
  cfg: MetaConfig,
  igAccountId: string,
  imageUrl: string,
  caption: string
): Promise<{ id: string }> {
  // Step 1: create media container
  const container = await graphPost(`${igAccountId}/media`, cfg.pageAccessToken, {
    image_url: imageUrl,
    caption,
  });

  // Step 2: publish container
  return graphPost(`${igAccountId}/media_publish`, cfg.pageAccessToken, {
    creation_id: container.id,
  });
}

/** Publish a Reel to Instagram. */
export async function igPublishReel(
  cfg: MetaConfig,
  igAccountId: string,
  videoUrl: string,
  caption: string,
  coverImageUrl?: string
): Promise<{ id: string }> {
  // Step 1: create reel container
  const body: Record<string, any> = {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
  };
  if (coverImageUrl) body.cover_url = coverImageUrl;

  const container = await graphPost(`${igAccountId}/media`, cfg.pageAccessToken, body);

  // Step 2: poll until ready (up to 60s)
  for (let i = 0; i < 12; i++) {
    await new Promise(r => setTimeout(r, 5000));
    const status = await graphGet(`${container.id}`, cfg.pageAccessToken, {
      fields: 'status_code',
    });
    if (status.status_code === 'FINISHED') break;
    if (status.status_code === 'ERROR') {
      throw new Error(`[meta-api] Reel container processing failed`);
    }
  }

  // Step 3: publish
  return graphPost(`${igAccountId}/media_publish`, cfg.pageAccessToken, {
    creation_id: container.id,
  });
}

/** Get recent Instagram media. */
export async function igGetRecentMedia(
  cfg: MetaConfig,
  igAccountId: string,
  limit = 10
): Promise<IGMedia[]> {
  const data = await graphGet(`${igAccountId}/media`, cfg.pageAccessToken, {
    fields: 'id,caption,media_type,timestamp,permalink',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Get comments on an Instagram media object. */
export async function igGetComments(
  cfg: MetaConfig,
  mediaId: string,
  limit = 25
): Promise<IGComment[]> {
  const data = await graphGet(`${mediaId}/comments`, cfg.pageAccessToken, {
    fields: 'id,text,username,timestamp',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Reply to an Instagram comment. */
export async function igReplyToComment(
  cfg: MetaConfig,
  igAccountId: string,
  commentId: string,
  message: string
): Promise<{ id: string }> {
  return graphPost(`${igAccountId}/replies`, cfg.pageAccessToken, {
    comment_id: commentId,
    message,
  });
}

/** Get Instagram DM conversations (requires instagram_manage_messages permission). */
export async function igGetDMConversations(
  cfg: MetaConfig,
  igAccountId: string,
  limit = 20
): Promise<FBConversation[]> {
  const data = await graphGet(`${igAccountId}/conversations`, cfg.pageAccessToken, {
    platform: 'instagram',
    fields: 'id,updated_time,participants',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Get messages in an Instagram DM conversation. */
export async function igGetDMMessages(
  cfg: MetaConfig,
  conversationId: string,
  limit = 10
): Promise<FBMessage[]> {
  const data = await graphGet(`${conversationId}/messages`, cfg.pageAccessToken, {
    fields: 'id,message,from,created_time',
    limit: String(limit),
  });
  return data.data ?? [];
}

/** Reply to an Instagram DM. */
export async function igReplyToDM(
  cfg: MetaConfig,
  igAccountId: string,
  recipientId: string,
  message: string
): Promise<any> {
  return graphPost(`${igAccountId}/messages`, cfg.pageAccessToken, {
    recipient: { id: recipientId },
    message: { text: message },
  });
}
