/**
 * Higgsfield API Integration
 *
 * Provides image and video generation for Jarvis via the Higgsfield platform.
 * Higgsfield gives access to 100+ generative models (FLUX, Kling, Seedance, etc.)
 * through a single unified API with async queue-based processing.
 *
 * Docs: https://docs.higgsfield.ai
 * Auth: Authorization: Key {api_key}:{api_key_secret}
 *
 * Pattern: submit → poll status → return URL
 */

export type HiggsConfig = {
  apiKey: string;       // format: "key_id:key_secret" OR separate fields below
  apiKeyId?: string;
  apiKeySecret?: string;
};

export type GenerationStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw';

export type GenerationResponse = {
  status: GenerationStatus;
  request_id: string;
  status_url: string;
  cancel_url: string;
  images?: Array<{ url: string }>;
  video?: { url: string };
  error?: string;
};

export type ImageGenOptions = {
  /** Model ID — defaults to higgsfield-ai/soul/standard */
  model?: string;
  prompt: string;
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
  resolution?: '480p' | '720p' | '1080p';
  negative_prompt?: string;
  seed?: number;
};

export type VideoGenOptions = {
  /** Model ID — defaults to higgsfield-ai/dop/preview */
  model?: string;
  /** Source image URL to animate */
  image_url: string;
  prompt: string;
  /** Duration in seconds (typically 5 or 10) */
  duration?: number;
  aspect_ratio?: '16:9' | '9:16' | '1:1';
};

export type TextToVideoOptions = {
  /** Model ID — defaults to bytedance/seedance/v1/lite/text-to-video */
  model?: string;
  prompt: string;
  duration?: number;
  aspect_ratio?: '16:9' | '9:16' | '1:1';
  resolution?: '480p' | '720p';
};

const BASE_URL = 'https://platform.higgsfield.ai';

// Default models — well-tested and fast
const DEFAULT_IMAGE_MODEL = 'higgsfield-ai/soul/standard';
const DEFAULT_VIDEO_MODEL = 'higgsfield-ai/dop/preview';
const DEFAULT_TEXT_VIDEO_MODEL = 'bytedance/seedance/v1/lite/text-to-video';

function authHeader(cfg: HiggsConfig): string {
  if (cfg.apiKeyId && cfg.apiKeySecret) {
    return `Key ${cfg.apiKeyId}:${cfg.apiKeySecret}`;
  }
  // apiKey may already be in "id:secret" format or just the key
  return `Key ${cfg.apiKey}`;
}

/** Submit a generation request and return the request_id */
async function submitRequest(
  cfg: HiggsConfig,
  modelId: string,
  body: Record<string, unknown>,
): Promise<GenerationResponse> {
  const resp = await fetch(`${BASE_URL}/${modelId}`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(cfg),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Higgsfield submit error (${resp.status}): ${text}`);
  }

  return resp.json() as Promise<GenerationResponse>;
}

/** Poll a request until completed/failed or timeout */
async function pollUntilDone(
  cfg: HiggsConfig,
  requestId: string,
  { intervalMs = 3000, maxWaitMs = 300_000 } = {},
): Promise<GenerationResponse> {
  const statusUrl = `${BASE_URL}/requests/${requestId}/status`;
  const deadline = Date.now() + maxWaitMs;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, intervalMs));

    const resp = await fetch(statusUrl, {
      headers: { Authorization: authHeader(cfg), Accept: 'application/json' },
    });

    if (!resp.ok) {
      throw new Error(`Higgsfield status error (${resp.status})`);
    }

    const data = await resp.json() as GenerationResponse;

    if (data.status === 'completed') return data;
    if (data.status === 'failed') throw new Error(`Higgsfield generation failed: ${data.error ?? 'unknown'}`);
    if (data.status === 'nsfw') throw new Error('Higgsfield: content flagged as NSFW (credits refunded)');

    // queued or in_progress — keep polling
    console.log(`[higgsfield] ${requestId} status: ${data.status}`);
  }

  throw new Error(`Higgsfield generation timed out after ${maxWaitMs / 1000}s`);
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Generate an image from a text prompt.
 * Returns the URL of the generated image.
 */
export async function generateImage(
  cfg: HiggsConfig,
  opts: ImageGenOptions,
): Promise<string> {
  const model = opts.model ?? DEFAULT_IMAGE_MODEL;

  console.log(`[higgsfield] Generating image with ${model}: "${opts.prompt.slice(0, 80)}..."`);

  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    aspect_ratio: opts.aspect_ratio ?? '1:1',
    resolution: opts.resolution ?? '720p',
  };
  if (opts.negative_prompt) body.negative_prompt = opts.negative_prompt;
  if (opts.seed !== undefined) body.seed = opts.seed;

  const queued = await submitRequest(cfg, model, body);
  console.log(`[higgsfield] Image queued as ${queued.request_id}`);

  const result = await pollUntilDone(cfg, queued.request_id);

  const imageUrl = result.images?.[0]?.url;
  if (!imageUrl) throw new Error('Higgsfield: no image URL in completed response');

  return imageUrl;
}

/**
 * Animate a static image into a video.
 * Returns the URL of the generated video.
 */
export async function generateVideoFromImage(
  cfg: HiggsConfig,
  opts: VideoGenOptions,
): Promise<string> {
  const model = opts.model ?? DEFAULT_VIDEO_MODEL;

  console.log(`[higgsfield] Generating video from image with ${model}`);

  const body: Record<string, unknown> = {
    image_url: opts.image_url,
    prompt: opts.prompt,
    duration: opts.duration ?? 5,
  };
  if (opts.aspect_ratio) body.aspect_ratio = opts.aspect_ratio;

  const queued = await submitRequest(cfg, model, body);
  console.log(`[higgsfield] Video queued as ${queued.request_id}`);

  // Videos take longer — allow up to 5 minutes
  const result = await pollUntilDone(cfg, queued.request_id, { intervalMs: 5000, maxWaitMs: 300_000 });

  const videoUrl = result.video?.url;
  if (!videoUrl) throw new Error('Higgsfield: no video URL in completed response');

  return videoUrl;
}

/**
 * Generate a video directly from a text prompt (no source image needed).
 */
export async function generateVideoFromText(
  cfg: HiggsConfig,
  opts: TextToVideoOptions,
): Promise<string> {
  const model = opts.model ?? DEFAULT_TEXT_VIDEO_MODEL;

  console.log(`[higgsfield] Generating text-to-video with ${model}: "${opts.prompt.slice(0, 80)}..."`);

  const body: Record<string, unknown> = {
    prompt: opts.prompt,
    duration: opts.duration ?? 5,
    aspect_ratio: opts.aspect_ratio ?? '9:16',  // default vertical for Reels/Stories
    resolution: opts.resolution ?? '720p',
  };

  const queued = await submitRequest(cfg, model, body);
  console.log(`[higgsfield] Text-to-video queued as ${queued.request_id}`);

  const result = await pollUntilDone(cfg, queued.request_id, { intervalMs: 5000, maxWaitMs: 300_000 });

  const videoUrl = result.video?.url;
  if (!videoUrl) throw new Error('Higgsfield: no video URL in completed response');

  return videoUrl;
}

/**
 * Check the status of an existing generation request by ID.
 */
export async function checkGenerationStatus(
  cfg: HiggsConfig,
  requestId: string,
): Promise<GenerationResponse> {
  const resp = await fetch(`${BASE_URL}/requests/${requestId}/status`, {
    headers: { Authorization: authHeader(cfg), Accept: 'application/json' },
  });
  if (!resp.ok) throw new Error(`Higgsfield status error (${resp.status})`);
  return resp.json() as Promise<GenerationResponse>;
}

/**
 * Cancel a queued (not yet in_progress) generation request.
 */
export async function cancelGeneration(
  cfg: HiggsConfig,
  requestId: string,
): Promise<boolean> {
  const resp = await fetch(`${BASE_URL}/requests/${requestId}/cancel`, {
    method: 'POST',
    headers: { Authorization: authHeader(cfg) },
  });
  return resp.status === 202;
}

/** Helper: build HiggsConfig from config.yaml higgsfield section */
export function makeHiggsConfig(jarvisConfig: unknown): HiggsConfig | null {
  const cfg = (jarvisConfig as Record<string, unknown>)?.higgsfield as Record<string, string> | undefined;
  if (!cfg?.api_key) return null;
  return { apiKey: cfg.api_key };
}
