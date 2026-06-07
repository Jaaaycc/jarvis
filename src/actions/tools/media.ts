/**
 * Media Generation Tools — Higgsfield Image & Video for the Jarvis Agent
 *
 * Registers tools so Jarvis can generate images and videos from chat:
 *   - generate_image       — text → image (FLUX / Soul / etc.)
 *   - animate_image        — image URL → video (DoP / Kling / Seedance)
 *   - generate_video       — text → video (Seedance lite)
 *   - check_generation     — check status of a pending generation by request ID
 *
 * All tools are non-destructive (read-only except creation of new media).
 * Generated media is returned as a URL for Jacob to download/use.
 */

import type { ToolDefinition } from './registry.ts';
import {
  generateImage,
  generateVideoFromImage,
  generateVideoFromText,
  checkGenerationStatus,
  makeHiggsConfig,
} from '../../integrations/higgsfield.ts';

export function createMediaTools(jarvisConfig: unknown): ToolDefinition[] {
  return [
    // ── Generate Image ─────────────────────────────────────────────────────
    {
      name: 'generate_image',
      description: `Generate a high-quality image from a text prompt using Higgsfield AI (FLUX, Soul, and 100+ models).
Returns a URL to the generated image. Use for creating marketing visuals, social media graphics, ad creatives, or any image Jacob needs.
Best models: higgsfield-ai/soul/standard (default), reve/text-to-image`,
      category: 'media',
      parameters: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image. Be specific about style, mood, colors, composition. E.g. "Professional photo of a sleek modern website on a MacBook screen, clean white office background, 8k, photorealistic"',
          required: true,
        },
        aspect_ratio: {
          type: 'string',
          description: 'Aspect ratio: 1:1 (square, default), 16:9 (landscape), 9:16 (vertical/Stories), 4:3, 3:4',
          required: false,
        },
        resolution: {
          type: 'string',
          description: 'Resolution: 480p, 720p (default), 1080p',
          required: false,
        },
        model: {
          type: 'string',
          description: 'Higgsfield model ID. Leave empty for default (higgsfield-ai/soul/standard). Other options: reve/text-to-image, bytedance/seedream/v4/edit',
          required: false,
        },
        negative_prompt: {
          type: 'string',
          description: 'What to avoid in the image (e.g. "blurry, low quality, watermark, text")',
          required: false,
        },
      },
      execute: async (params) => {
        const cfg = makeHiggsConfig(jarvisConfig);
        if (!cfg) return 'Higgsfield not configured — add higgsfield.api_key to config.yaml. Get your key at https://cloud.higgsfield.ai';

        try {
          const url = await generateImage(cfg, {
            prompt: params.prompt as string,
            aspect_ratio: (params.aspect_ratio as any) ?? '1:1',
            resolution: (params.resolution as any) ?? '720p',
            model: params.model as string | undefined,
            negative_prompt: params.negative_prompt as string | undefined,
          });
          return `✅ Image generated!\n\nURL: ${url}\n\nRight-click → Save As to download, or use this URL directly in posts/ads.`;
        } catch (err) {
          return `Error generating image: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Animate Image to Video ─────────────────────────────────────────────
    {
      name: 'animate_image',
      description: `Transform a static image into an animated video using Higgsfield AI.
Perfect for turning website screenshots, product photos, or AI-generated images into engaging Reels/TikTok content.
Returns a URL to the generated video (MP4).
Best models: higgsfield-ai/dop/preview (default), kling-video/v2.1/pro/image-to-video, bytedance/seedance/v1/pro/image-to-video`,
      category: 'media',
      parameters: {
        image_url: {
          type: 'string',
          description: 'URL of the source image to animate. Should be a publicly accessible URL.',
          required: true,
        },
        prompt: {
          type: 'string',
          description: 'Motion description. Describe camera movement and animation: "smooth camera pan from left to right, website elements fade in, professional and clean motion"',
          required: true,
        },
        duration: {
          type: 'number',
          description: 'Video duration in seconds. Default 5. Max typically 10.',
          required: false,
        },
        aspect_ratio: {
          type: 'string',
          description: 'Aspect ratio: 16:9 (landscape), 9:16 (vertical Reels, default), 1:1 (square)',
          required: false,
        },
        model: {
          type: 'string',
          description: 'Model ID. Leave empty for default (higgsfield-ai/dop/preview)',
          required: false,
        },
      },
      execute: async (params) => {
        const cfg = makeHiggsConfig(jarvisConfig);
        if (!cfg) return 'Higgsfield not configured — add higgsfield.api_key to config.yaml. Get your key at https://cloud.higgsfield.ai';

        try {
          const url = await generateVideoFromImage(cfg, {
            image_url: params.image_url as string,
            prompt: params.prompt as string,
            duration: (params.duration as number) ?? 5,
            aspect_ratio: (params.aspect_ratio as any) ?? '9:16',
            model: params.model as string | undefined,
          });
          return `✅ Video generated!\n\nURL: ${url}\n\nDownload this MP4 to post as a Reel, TikTok, or Story. Duration: ${params.duration ?? 5}s`;
        } catch (err) {
          return `Error generating video: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Text to Video ──────────────────────────────────────────────────────
    {
      name: 'generate_video',
      description: `Generate a video directly from a text prompt — no source image needed.
Great for creating b-roll, background videos, or creative content for Reels.
Returns a URL to the generated video (MP4).`,
      category: 'media',
      parameters: {
        prompt: {
          type: 'string',
          description: 'Detailed video description including motion, camera angles, style. E.g. "Aerial drone shot slowly panning over a modern city skyline at golden hour, cinematic, 4K quality"',
          required: true,
        },
        duration: {
          type: 'number',
          description: 'Duration in seconds. Default 5.',
          required: false,
        },
        aspect_ratio: {
          type: 'string',
          description: 'Aspect ratio: 9:16 (vertical Reels, default), 16:9 (landscape), 1:1 (square)',
          required: false,
        },
        resolution: {
          type: 'string',
          description: '480p or 720p (default)',
          required: false,
        },
        model: {
          type: 'string',
          description: 'Model ID. Leave empty for default (bytedance/seedance/v1/lite/text-to-video)',
          required: false,
        },
      },
      execute: async (params) => {
        const cfg = makeHiggsConfig(jarvisConfig);
        if (!cfg) return 'Higgsfield not configured — add higgsfield.api_key to config.yaml. Get your key at https://cloud.higgsfield.ai';

        try {
          const url = await generateVideoFromText(cfg, {
            prompt: params.prompt as string,
            duration: (params.duration as number) ?? 5,
            aspect_ratio: (params.aspect_ratio as any) ?? '9:16',
            resolution: (params.resolution as any) ?? '720p',
            model: params.model as string | undefined,
          });
          return `✅ Video generated!\n\nURL: ${url}\n\nDownload this MP4 for use as a Reel, Story, or ad creative.`;
        } catch (err) {
          return `Error generating video: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },

    // ── Check Generation Status ────────────────────────────────────────────
    {
      name: 'check_generation',
      description: 'Check the status of a Higgsfield generation request that is still processing. Returns current status and media URL if completed.',
      category: 'media',
      parameters: {
        request_id: {
          type: 'string',
          description: 'The request_id returned when the generation was submitted',
          required: true,
        },
      },
      execute: async (params) => {
        const cfg = makeHiggsConfig(jarvisConfig);
        if (!cfg) return 'Higgsfield not configured';

        try {
          const result = await checkGenerationStatus(cfg, params.request_id as string);

          if (result.status === 'completed') {
            const mediaUrl = result.images?.[0]?.url ?? result.video?.url ?? 'No URL';
            return `✅ Completed!\n\nMedia URL: ${mediaUrl}`;
          }

          if (result.status === 'failed') return `❌ Generation failed`;
          if (result.status === 'nsfw') return `⚠️ Content flagged as NSFW — credits refunded`;

          return `⏳ Status: ${result.status}\nRequest ID: ${result.request_id}\nCheck again in a few seconds.`;
        } catch (err) {
          return `Error checking status: ${err instanceof Error ? err.message : String(err)}`;
        }
      },
    },
  ];
}
