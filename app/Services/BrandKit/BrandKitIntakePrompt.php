<?php

namespace App\Services\BrandKit;

use App\Models\BrandKit;

/**
 * The prompt a user copies into ChatGPT / Claude to have an outside agent fill
 * in one brand kit from a website.
 *
 * It is built here rather than in the Svelte page for one reason: the prompt IS
 * the API contract. Every role name, every endpoint and every enum it lists has
 * to stay in step with `BrandKit` and `StoreBrandKitRequest`, and a copy living
 * in the frontend would drift the first time a role is added.
 */
class BrandKitIntakePrompt
{
    /**
     * @return array{prompt: string, intake_url: string, expires_at: string|null}
     */
    public static function for(BrandKit $kit, string $token): array
    {
        $intakeUrl = route('brand-intake.show', ['token' => $token]);

        return [
            'prompt' => self::build($kit, $intakeUrl),
            'intake_url' => $intakeUrl,
            'expires_at' => $kit->intake_token_expires_at?->toIso8601String(),
        ];
    }

    protected static function build(BrandKit $kit, string $intakeUrl): string
    {
        $website = $kit->website_url ?: '<PASTE THE WEBSITE URL HERE>';
        $colorRoles = implode(', ', BrandKit::COLOR_ROLES);
        $fontRoles = implode(', ', BrandKit::FONT_ROLES);
        $logoVariants = implode(', ', BrandKit::LOGO_VARIANTS);
        $watermarkPositions = implode(' | ', BrandKit::WATERMARK_POSITIONS);

        return <<<PROMPT
        You are setting up a brand kit for a video editor, by analysing a website and
        writing the result back through a small HTTP API.

        WEBSITE TO ANALYSE: {$website}
        BRAND KIT API (the token in the URL is the only authentication; it is scoped to
        this one brand kit and expires):

            {$intakeUrl}

        STEP 1 — read the current state and the field contract:

            curl -s "{$intakeUrl}"

        STEP 2 — analyse the website. Fetch the landing page and, if you can, its CSS,
        an "about" or "brand" page and the favicon/logo files. Work out:
          - the colour palette, as #rrggbb (or #rrggbbaa) hex
          - the real font families, as CSS font stacks (e.g. "Inter, sans-serif")
          - the logo files (prefer SVG or a large transparent PNG)
          - the tone of voice, in two or three sentences someone could write copy from

        STEP 3 — upload the logo files. Give the API a public URL and it downloads the
        file itself; pass `role` and it also attaches the asset to that slot:

            curl -s -X POST "{$intakeUrl}/assets" \\
              -H 'Content-Type: application/json' \\
              -d '{"source_url":"https://example.com/logo.svg","name":"Wordmark","role":"logo_full"}'

        Valid roles: logo_full, logo_mark, logo_light, logo_dark, watermark, intro, outro.
        Omit `role` to upload without attaching. The response contains the asset `id`.

        STEP 4 — write the kit. PATCH is a merge: send only the keys you determined,
        and repeat it as many times as you like.

            curl -s -X PATCH "{$intakeUrl}" \\
              -H 'Content-Type: application/json' \\
              -d '{
                "name": "Acme",
                "website_url": "{$website}",
                "colors": {
                  "primary": "#ff3366",
                  "secondary": "#1f1f2e",
                  "accent": "#ffd166",
                  "background": "#0b0b12",
                  "text": "#ffffff",
                  "caption_highlight": "#ffd166"
                },
                "fonts": {
                  "display": "Montserrat, sans-serif",
                  "body": "Inter, sans-serif",
                  "caption": "Poppins, sans-serif"
                },
                "watermark": {"asset_id": 123, "position": "bottom-right", "opacity": 0.6, "size": 0.12},
                "music": {"mood": "upbeat lo-fi"},
                "caption_preset": "bold-outline",
                "tone": "Confident, playful, short sentences. Never use exclamation marks."
              }'

        FIELDS
          name                string
          website_url         string (url)
          colors.<role>       hex, roles: {$colorRoles}
          fonts.<role>        CSS font stack, roles: {$fontRoles}
          logos.<variant>     asset id, variants: {$logoVariants}
          watermark           {asset_id, position, opacity 0-1, size 0-1}
                              position: {$watermarkPositions}
          intro_asset_id      asset id of a short intro clip (video), or null
          outro_asset_id      asset id of a short outro clip (video), or null
          voice               {model_id, voice_id} for text-to-speech, or null
          music               {mood} a short music brief, or null
          caption_preset      short slug, e.g. "bold-outline"
          motion_preset       short slug, e.g. "ken-burns-in"
          tone                up to 2000 characters of tone-of-voice guidance

        RULES
          - Every colour must be real, taken from the site — never invent a palette. If
            the site genuinely has no accent colour, leave that role out.
          - `background` and `text` must contrast: this kit styles video captions.
          - Prefer the brand's own fonts; fall back to a close web-safe stack and say so.
          - Do not send fields you could not determine.

        STEP 5 — verify with a final `curl -s "{$intakeUrl}"` and report back to me: what
        you set, what you could not determine, and the URLs you took the logos from.
        PROMPT;
    }
}
