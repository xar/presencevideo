<script lang="ts">
    import { router } from '@inertiajs/svelte';
    import { Check, Copy, ExternalLink, Palette, Plus, Sparkles, Trash2 } from 'lucide-svelte';
    import AppHead from '@/components/AppHead.svelte';
    import { Button } from '@/components/ui/button';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import AppLayout from '@/layouts/AppLayout.svelte';
    import brandKitRoutes from '@/routes/editor/brand-kits';
    import type { Asset, BrandColorRole, BrandFontRole, BrandKit, BreadcrumbItem } from '@/types';

    let {
        brandKits = [],
        imageAssets = [],
        videoAssets = [],
        audioAssets = []
    }: {
        brandKits: BrandKit[];
        imageAssets: Asset[];
        videoAssets: Asset[];
        audioAssets: Asset[];
    } = $props();

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Projects', href: '/editor' },
        { title: 'Brand kits', href: '/editor/brand-kits' }
    ];

    const COLOR_ROLES: { role: BrandColorRole; label: string }[] = [
        { role: 'primary', label: 'Primary' },
        { role: 'secondary', label: 'Secondary' },
        { role: 'accent', label: 'Accent' },
        { role: 'background', label: 'Background' },
        { role: 'text', label: 'Text' },
        { role: 'caption_highlight', label: 'Caption highlight' }
    ];

    const FONT_ROLES: { role: BrandFontRole; label: string }[] = [
        { role: 'display', label: 'Display' },
        { role: 'body', label: 'Body' },
        { role: 'caption', label: 'Caption' }
    ];

    const LOGO_VARIANTS = [
        { key: 'full', label: 'Full wordmark' },
        { key: 'mark', label: 'Mark' },
        { key: 'light', label: 'On light' },
        { key: 'dark', label: 'On dark' }
    ] as const;

    const WATERMARK_POSITIONS = ['top-left', 'top-right', 'bottom-left', 'bottom-right'] as const;

    type KitForm = {
        name: string;
        website_url: string;
        colors: Record<BrandColorRole, string>;
        fonts: Record<BrandFontRole, string>;
        logos: Record<(typeof LOGO_VARIANTS)[number]['key'], number | null>;
        watermark: {
            asset_id: number | null;
            position: (typeof WATERMARK_POSITIONS)[number];
            opacity: number;
            size: number;
        };
        intro_asset_id: number | null;
        outro_asset_id: number | null;
        voice: { model_id: string; voice_id: string };
        music: { mood: string };
        caption_preset: string;
        motion_preset: string;
        tone: string;
    };

    function emptyForm(): KitForm {
        return {
            name: '',
            website_url: '',
            colors: {
                primary: '#ff3366',
                secondary: '#1f1f2e',
                accent: '#ffd166',
                background: '#0b0b12',
                text: '#ffffff',
                caption_highlight: '#ffd166'
            },
            fonts: { display: 'Montserrat, sans-serif', body: 'Inter, sans-serif', caption: 'Poppins, sans-serif' },
            logos: { full: null, mark: null, light: null, dark: null },
            watermark: { asset_id: null, position: 'bottom-right', opacity: 0.6, size: 0.12 },
            intro_asset_id: null,
            outro_asset_id: null,
            voice: { model_id: '', voice_id: '' },
            music: { mood: '' },
            caption_preset: 'bold-outline',
            motion_preset: '',
            tone: ''
        };
    }

    function formFrom(kit: BrandKit): KitForm {
        const base = emptyForm();
        return {
            ...base,
            name: kit.name,
            website_url: kit.website_url ?? '',
            colors: { ...base.colors, ...(kit.colors ?? {}) } as KitForm['colors'],
            fonts: { ...base.fonts, ...(kit.fonts ?? {}) } as KitForm['fonts'],
            logos: { ...base.logos, ...(kit.logos ?? {}) } as KitForm['logos'],
            watermark: { ...base.watermark, ...(kit.watermark ?? {}) } as KitForm['watermark'],
            intro_asset_id: kit.intro_asset_id ?? null,
            outro_asset_id: kit.outro_asset_id ?? null,
            voice: { model_id: kit.voice?.model_id ?? '', voice_id: kit.voice?.voice_id ?? '' },
            music: { mood: kit.music?.mood ?? '' },
            caption_preset: kit.caption_preset ?? '',
            motion_preset: kit.motion_preset ?? '',
            tone: kit.tone ?? ''
        };
    }

    let editingId = $state<number | 'new' | null>(null);
    let form = $state<KitForm>(emptyForm());
    let isSaving = $state(false);

    function startNew() {
        editingId = 'new';
        form = emptyForm();
    }

    function startEdit(kit: BrandKit) {
        editingId = kit.id;
        form = formFrom(kit);
    }

    function cancel() {
        editingId = null;
    }

    function orNull(value: string): string | null {
        return value.trim() === '' ? null : value;
    }

    function payload() {
        return {
            name: form.name.trim(),
            website_url: orNull(form.website_url),
            colors: form.colors,
            fonts: form.fonts,
            logos: form.logos,
            watermark: form.watermark.asset_id ? form.watermark : null,
            intro_asset_id: form.intro_asset_id,
            outro_asset_id: form.outro_asset_id,
            voice: form.voice.model_id || form.voice.voice_id
                ? { model_id: orNull(form.voice.model_id), voice_id: orNull(form.voice.voice_id) }
                : null,
            music: form.music.mood ? { mood: form.music.mood } : null,
            caption_preset: orNull(form.caption_preset),
            motion_preset: orNull(form.motion_preset),
            tone: orNull(form.tone)
        };
    }

    function save() {
        if (!form.name.trim() || isSaving) return;
        isSaving = true;

        const options = {
            preserveScroll: true,
            onSuccess: () => {
                editingId = null;
                isSaving = false;
            },
            onError: () => {
                isSaving = false;
            }
        };

        if (editingId === 'new') {
            router.post(brandKitRoutes.store.url(), payload(), options);
        } else if (editingId !== null) {
            router.put(brandKitRoutes.update.url(editingId), payload(), options);
        }
    }

    function remove(kit: BrandKit) {
        if (!confirm(`Delete brand kit "${kit.name}"? Projects using it fall back to default colours.`)) return;
        router.delete(brandKitRoutes.destroy.url(kit.id), { preserveScroll: true });
    }

    /*
     * AI intake: mint a one-kit, expiring capability and hand the user a prompt
     * that carries it, so an outside agent (ChatGPT, Claude) can analyse their
     * website and fill the kit in over curl. The prompt text is built on the
     * server — it IS the API contract, and a second copy here would drift.
     */

    type IntakeLink = {
        brand_kit_id: number;
        prompt: string;
        intake_url: string;
        expires_at: string | null;
    };

    let intakeWebsite = $state('');
    let intakeTarget = $state<'new' | number>('new');
    let intakeBusy = $state(false);
    let intakeError = $state<string | null>(null);
    let intake = $state<IntakeLink | null>(null);
    let copiedField = $state<'prompt' | 'link' | null>(null);

    function csrfToken(): string {
        return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
    }

    async function mintIntakeLink(): Promise<IntakeLink | null> {
        if (intakeBusy) return null;
        intakeBusy = true;
        intakeError = null;

        try {
            const response = await fetch(brandKitRoutes.intakeLink.url(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                    'X-CSRF-TOKEN': csrfToken()
                },
                body: JSON.stringify({
                    brand_kit_id: intakeTarget === 'new' ? null : intakeTarget,
                    website_url: intakeWebsite.trim() === '' ? null : intakeWebsite.trim()
                })
            });

            if (!response.ok) {
                const body = await response.json().catch(() => null);
                intakeError = body?.message ?? 'Could not create the link. Check the website URL.';
                return null;
            }

            intake = (await response.json()) as IntakeLink;
            intakeTarget = intake.brand_kit_id;
            router.reload({ only: ['brandKits'] });

            return intake;
        } catch {
            intakeError = 'Could not reach the server.';
            return null;
        } finally {
            intakeBusy = false;
        }
    }

    async function copy(text: string, field: 'prompt' | 'link') {
        try {
            await navigator.clipboard.writeText(text);
            copiedField = field;
            setTimeout(() => (copiedField = null), 2000);
        } catch {
            intakeError = 'Clipboard blocked by the browser — select the text below and copy it manually.';
        }
    }

    async function copyPrompt() {
        const link = intake ?? (await mintIntakeLink());
        if (link) await copy(link.prompt, 'prompt');
    }

    /** Copy first, then open the chat prefilled: the URL may be truncated, the clipboard is not. */
    async function openInChat(service: 'chatgpt' | 'claude') {
        const link = intake ?? (await mintIntakeLink());
        if (!link) return;

        await copy(link.prompt, 'prompt');

        const base = service === 'chatgpt' ? 'https://chatgpt.com/?q=' : 'https://claude.ai/new?q=';
        window.open(base + encodeURIComponent(link.prompt), '_blank', 'noopener');
    }

    function resetIntake() {
        intake = null;
        intakeError = null;
        copiedField = null;
    }

    function numberOrNull(e: Event): number | null {
        const value = (e.target as HTMLSelectElement).value;
        return value === '' ? null : Number(value);
    }

    function stringFrom(e: Event): string {
        return (e.target as HTMLInputElement).value;
    }
</script>

<AppHead title="Brand kits" />

<AppLayout {breadcrumbs}
           title="Brand kits"
           description="Colours, fonts, logos and voice every branded video is built from">
    {#snippet actions()}
        <Button class="rounded-full px-5 shadow-sm"
                onclick={startNew}>
            <Plus class="mr-2 h-4 w-4" />
            New brand kit
        </Button>
    {/snippet}

    <div class="flex h-[calc(100dvh-7rem)] min-h-0 flex-col gap-4">
        <Card class="shrink-0">
            <CardHeader class="py-4">
                <CardTitle class="flex items-center gap-2 text-base">
                    <Sparkles class="h-4 w-4 text-primary" />
                    Let an AI build the kit from your website
                </CardTitle>
                <CardDescription>
                    Copy the prompt into ChatGPT or Claude. It carries a private, expiring link that lets the
                    agent read your site and write the colours, fonts, logos and tone straight back into this kit.
                </CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
                <div class="flex flex-wrap items-end gap-3">
                    <div class="grid min-w-64 flex-1 gap-1">
                        <Label for="intake-website"
                               class="text-xs">Website</Label>
                        <Input id="intake-website"
                               type="url"
                               value={intakeWebsite}
                               oninput={(e) => { intakeWebsite = stringFrom(e); resetIntake(); }}
                               placeholder="https://acme.com" />
                    </div>
                    <div class="grid gap-1">
                        <Label for="intake-target"
                               class="text-xs">Fills in</Label>
                        <select id="intake-target"
                                class="h-9 rounded-md border bg-background px-2 text-sm"
                                value={intakeTarget}
                                onchange={(e) => {
                                    const value = (e.target as HTMLSelectElement).value;
                                    intakeTarget = value === 'new' ? 'new' : Number(value);
                                    resetIntake();
                                }}>
                            <option value="new">A new brand kit</option>
                            {#each brandKits as kit (kit.id)}
                                <option value={kit.id}>{kit.name}</option>
                            {/each}
                        </select>
                    </div>
                    <Button onclick={copyPrompt}
                            disabled={intakeBusy}>
                        {#if copiedField === 'prompt'}
                            <Check class="mr-2 h-4 w-4" />
                            Copied
                        {:else}
                            <Copy class="mr-2 h-4 w-4" />
                            Copy prompt
                        {/if}
                    </Button>
                    <Button variant="outline"
                            onclick={() => openInChat('claude')}
                            disabled={intakeBusy}>
                        <ExternalLink class="mr-2 h-4 w-4" />
                        Claude
                    </Button>
                    <Button variant="outline"
                            onclick={() => openInChat('chatgpt')}
                            disabled={intakeBusy}>
                        <ExternalLink class="mr-2 h-4 w-4" />
                        ChatGPT
                    </Button>
                </div>

                {#if intakeError}
                    <p class="text-sm text-destructive">{intakeError}</p>
                {/if}

                {#if intake}
                    <div class="space-y-2 rounded-md border bg-muted/40 p-3">
                        <div class="flex flex-wrap items-center gap-2">
                            <code class="flex-1 truncate rounded bg-background px-2 py-1 font-mono text-xs">{intake.intake_url}</code>
                            <Button variant="ghost"
                                    size="sm"
                                    onclick={() => copy(intake!.intake_url, 'link')}>
                                {copiedField === 'link' ? 'Copied' : 'Copy link'}
                            </Button>
                            <Button variant="ghost"
                                    size="sm"
                                    onclick={mintIntakeLink}
                                    disabled={intakeBusy}>New link</Button>
                        </div>
                        <p class="text-xs text-muted-foreground">
                            Anyone with this link can write to this one brand kit until
                            {intake.expires_at ? new Date(intake.expires_at).toLocaleString() : 'it expires'}.
                            Generating a new link revokes this one.
                        </p>
                        <details>
                            <summary class="cursor-pointer text-xs text-muted-foreground">Show the prompt</summary>
                            <textarea readonly
                                      class="mt-2 h-48 w-full rounded-md border bg-background p-2 font-mono text-xs"
                                      value={intake.prompt}></textarea>
                        </details>
                    </div>
                {/if}
            </CardContent>
        </Card>

        <div class="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div class="space-y-3  overflow-y-auto">
            {#if brandKits.length === 0}
                <Card>
                    <CardContent class="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
                        <Palette class="h-8 w-8" />
                        <p class="text-sm">No brand kits yet. Create one and attach it to a project to style it with
                            tokens.</p>
                    </CardContent>
                </Card>
            {/if}

            {#each brandKits as kit (kit.id)}
                <Card class={editingId === kit.id ? 'border-primary' : ''}>
                    <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0">
                        <div>
                            <CardTitle class="text-base">{kit.name}</CardTitle>
                            <CardDescription class="truncate">
                                {kit.website_url ?? kit.fonts?.display ?? 'No display font'}
                            </CardDescription>
                        </div>
                        <div class="flex gap-1">
                            <Button variant="outline"
                                    size="sm"
                                    onclick={() => startEdit(kit)}>Edit
                            </Button>
                            <Button variant="ghost"
                                    size="sm"
                                    onclick={() => remove(kit)}
                                    aria-label="Delete">
                                <Trash2 class="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div class="flex gap-1.5">
                            {#each COLOR_ROLES as { role, label } (role)}
                                <span
                                    class="h-6 w-6 rounded-full border"
                                    style="background: {kit.colors?.[role] ?? 'transparent'}"
                                    title="{label}: {kit.colors?.[role] ?? 'unset'}"
                                ></span>
                            {/each}
                        </div>
                    </CardContent>
                </Card>
            {/each}
        </div>

        {#if editingId !== null}
            <div class=" overflow-y-auto p-4">


                <Card class="pb-4">
                    <CardHeader class="py-4">
                        <CardTitle>{editingId === 'new' ? 'New brand kit' : 'Edit brand kit'}</CardTitle>
                        <CardDescription>
                            Elements reference these as tokens such as <code>brand.primary</code> or
                            <code>brand.display</code>.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form class="space-y-6"
                              onsubmit={(e) => { e.preventDefault(); save(); }}>
                            <div class="grid gap-3 sm:grid-cols-2">
                                <div class="grid gap-2">
                                    <Label for="kit-name">Name</Label>
                                    <Input id="kit-name"
                                           value={form.name}
                                           oninput={(e) => (form.name = stringFrom(e))}
                                           placeholder="Acme" />
                                </div>
                                <div class="grid gap-2">
                                    <Label for="kit-website">Website</Label>
                                    <Input id="kit-website"
                                           type="url"
                                           value={form.website_url}
                                           oninput={(e) => (form.website_url = stringFrom(e))}
                                           placeholder="https://acme.com" />
                                </div>
                            </div>

                            <fieldset class="space-y-3">
                                <legend class="text-sm font-medium">Colours</legend>
                                <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {#each COLOR_ROLES as { role, label } (role)}
                                        <div class="grid gap-1">
                                            <Label for="color-{role}"
                                                   class="text-xs">{label}</Label>
                                            <div class="flex items-center gap-2">
                                                <input
                                                    id="color-{role}"
                                                    type="color"
                                                    class="h-8 w-10 cursor-pointer rounded border bg-transparent"
                                                    value={form.colors[role].slice(0, 7)}
                                                    oninput={(e) => (form.colors[role] = stringFrom(e))}
                                                />
                                                <Input value={form.colors[role]}
                                                       oninput={(e) => (form.colors[role] = stringFrom(e))}
                                                       class="h-8 flex-1 font-mono text-xs" />
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </fieldset>

                            <fieldset class="space-y-3">
                                <legend class="text-sm font-medium">Fonts</legend>
                                <div class="grid gap-3 sm:grid-cols-3">
                                    {#each FONT_ROLES as { role, label } (role)}
                                        <div class="grid gap-1">
                                            <Label for="font-{role}"
                                                   class="text-xs">{label}</Label>
                                            <Input id="font-{role}"
                                                   value={form.fonts[role]}
                                                   oninput={(e) => (form.fonts[role] = stringFrom(e))}
                                                   placeholder="Inter, sans-serif" />
                                        </div>
                                    {/each}
                                </div>
                            </fieldset>

                            <fieldset class="space-y-3">
                                <legend class="text-sm font-medium">Logos</legend>
                                <div class="grid gap-3 sm:grid-cols-2">
                                    {#each LOGO_VARIANTS as { key, label } (key)}
                                        <div class="grid gap-1">
                                            <Label for="logo-{key}"
                                                   class="text-xs">{label}</Label>
                                            <select
                                                id="logo-{key}"
                                                class="h-9 rounded-md border bg-background px-2 text-sm"
                                                value={form.logos[key] ?? ''}
                                                onchange={(e) => (form.logos[key] = numberOrNull(e))}
                                            >
                                                <option value="">None</option>
                                                {#each imageAssets as asset (asset.id)}
                                                    <option value={asset.id}>{asset.name}</option>
                                                {/each}
                                            </select>
                                        </div>
                                    {/each}
                                </div>
                            </fieldset>

                            <fieldset class="space-y-3">
                                <legend class="text-sm font-medium">Watermark</legend>
                                <div class="grid gap-3 sm:grid-cols-2">
                                    <div class="grid gap-1">
                                        <Label for="wm-asset"
                                               class="text-xs">Image</Label>
                                        <select
                                            id="wm-asset"
                                            class="h-9 rounded-md border bg-background px-2 text-sm"
                                            value={form.watermark.asset_id ?? ''}
                                            onchange={(e) => (form.watermark.asset_id = numberOrNull(e))}
                                        >
                                            <option value="">None</option>
                                            {#each imageAssets as asset (asset.id)}
                                                <option value={asset.id}>{asset.name}</option>
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="grid gap-1">
                                        <Label for="wm-position"
                                               class="text-xs">Position</Label>
                                        <select
                                            id="wm-position"
                                            class="h-9 rounded-md border bg-background px-2 text-sm"
                                            value={form.watermark.position}
                                            onchange={(e) => (form.watermark.position = (e.target as HTMLSelectElement).value as KitForm['watermark']['position'])}
                                        >
                                            {#each WATERMARK_POSITIONS as position (position)}
                                                <option value={position}>{position}</option>
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="grid gap-1">
                                        <Label for="wm-opacity"
                                               class="text-xs">Opacity (0–1)</Label>
                                        <Input id="wm-opacity"
                                               type="number"
                                               min="0"
                                               max="1"
                                               step="0.05"
                                               value={form.watermark.opacity}
                                               oninput={(e) => (form.watermark.opacity = Number(stringFrom(e)))} />
                                    </div>
                                    <div class="grid gap-1">
                                        <Label for="wm-size"
                                               class="text-xs">Size (fraction of width)</Label>
                                        <Input id="wm-size"
                                               type="number"
                                               min="0"
                                               max="1"
                                               step="0.01"
                                               value={form.watermark.size}
                                               oninput={(e) => (form.watermark.size = Number(stringFrom(e)))} />
                                    </div>
                                </div>
                            </fieldset>

                            <fieldset class="space-y-3">
                                <legend class="text-sm font-medium">Intro and outro</legend>
                                <div class="grid gap-3 sm:grid-cols-2">
                                    <div class="grid gap-1">
                                        <Label for="intro"
                                               class="text-xs">Intro clip</Label>
                                        <select id="intro"
                                                class="h-9 rounded-md border bg-background px-2 text-sm"
                                                value={form.intro_asset_id ?? ''}
                                                onchange={(e) => (form.intro_asset_id = numberOrNull(e))}>
                                            <option value="">None</option>
                                            {#each videoAssets as asset (asset.id)}
                                                <option value={asset.id}>{asset.name}</option>
                                            {/each}
                                        </select>
                                    </div>
                                    <div class="grid gap-1">
                                        <Label for="outro"
                                               class="text-xs">Outro clip</Label>
                                        <select id="outro"
                                                class="h-9 rounded-md border bg-background px-2 text-sm"
                                                value={form.outro_asset_id ?? ''}
                                                onchange={(e) => (form.outro_asset_id = numberOrNull(e))}>
                                            <option value="">None</option>
                                            {#each videoAssets as asset (asset.id)}
                                                <option value={asset.id}>{asset.name}</option>
                                            {/each}
                                        </select>
                                    </div>
                                </div>
                            </fieldset>

                            <fieldset class="space-y-3">
                                <legend class="text-sm font-medium">Voice and music</legend>
                                <div class="grid gap-3 sm:grid-cols-3">
                                    <div class="grid gap-1">
                                        <Label for="voice-model"
                                               class="text-xs">TTS model id</Label>
                                        <Input id="voice-model"
                                               value={form.voice.model_id}
                                               oninput={(e) => (form.voice.model_id = stringFrom(e))}
                                               placeholder="fal-ai/minimax/speech-2.8-turbo" />
                                    </div>
                                    <div class="grid gap-1">
                                        <Label for="voice-id"
                                               class="text-xs">Voice id</Label>
                                        <Input id="voice-id"
                                               value={form.voice.voice_id}
                                               oninput={(e) => (form.voice.voice_id = stringFrom(e))} />
                                    </div>
                                    <div class="grid gap-1">
                                        <Label for="music-mood"
                                               class="text-xs">Music mood</Label>
                                        <Input id="music-mood"
                                               value={form.music.mood}
                                               oninput={(e) => (form.music.mood = stringFrom(e))}
                                               placeholder="upbeat lo-fi" />
                                    </div>
                                </div>
                                {#if audioAssets.length > 0}
                                    <p class="text-xs text-muted-foreground">{audioAssets.length} audio assets available
                                        to the music agent.</p>
                                {/if}
                            </fieldset>

                            <fieldset class="space-y-3">
                                <legend class="text-sm font-medium">Defaults and tone</legend>
                                <div class="grid gap-3 sm:grid-cols-2">
                                    <div class="grid gap-1">
                                        <Label for="caption-preset"
                                               class="text-xs">Caption preset</Label>
                                        <Input id="caption-preset"
                                               value={form.caption_preset}
                                               oninput={(e) => (form.caption_preset = stringFrom(e))}
                                               placeholder="bold-outline" />
                                    </div>
                                    <div class="grid gap-1">
                                        <Label for="motion-preset"
                                               class="text-xs">Motion preset</Label>
                                        <Input id="motion-preset"
                                               value={form.motion_preset}
                                               oninput={(e) => (form.motion_preset = stringFrom(e))}
                                               placeholder="ken-burns-in" />
                                    </div>
                                </div>
                                <div class="grid gap-1">
                                    <Label for="tone"
                                           class="text-xs">Tone of voice</Label>
                                    <textarea
                                        id="tone"
                                        class="min-h-20 rounded-md border bg-background px-3 py-2 text-sm"
                                        value={form.tone}
                                        oninput={(e) => (form.tone = (e.target as HTMLTextAreaElement).value)}
                                        placeholder="Confident, playful, short sentences. Never use exclamation marks."
                                    ></textarea>
                                </div>
                            </fieldset>

                            <div class="flex justify-end gap-2">
                                <Button type="button"
                                        variant="ghost"
                                        onclick={cancel}>Cancel
                                </Button>
                                <Button type="submit"
                                        disabled={isSaving || !form.name.trim()}>
                                    {editingId === 'new' ? 'Create kit' : 'Save changes'}
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            </div>
        {/if}
        </div>
    </div>
</AppLayout>
