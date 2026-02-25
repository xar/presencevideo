<script lang="ts">
    import { Link, page } from '@inertiajs/svelte';
    import AppHead from '@/components/AppHead.svelte';
    import { toUrl } from '@/lib/utils';
    import { dashboard, login, register } from '@/routes';
    import Button from '@/components/ui/button/Button.svelte';
    import Badge from '@/components/ui/badge/Badge.svelte';
    import Card from '@/components/ui/card/Card.svelte';
    import CardContent from '@/components/ui/card/CardContent.svelte';
    import Separator from '@/components/ui/separator/Separator.svelte';
    import {
        Sparkles,
        Video,
        Image,
        Music,
        Mic,
        ArrowRight,
        Play,
    } from 'lucide-svelte';

    let {
        canRegister = true,
    }: {
        canRegister: boolean;
    } = $props();

    const auth = $derived($page.props.auth);

    const features = [
        {
            icon: Image,
            title: 'Text to Image',
            description:
                'Generate stunning visuals from words. FLUX, Stable Diffusion, and more.',
            color: 'text-violet-500',
            bgColor: 'bg-violet-500/10',
        },
        {
            icon: Video,
            title: 'Image to Video',
            description:
                'Bring your images to life. MiniMax, Kling, Luma Dream Machine.',
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
        },
        {
            icon: Mic,
            title: 'Text to Speech',
            description:
                'Natural voiceovers that sound human. Multiple voices and languages.',
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
        },
        {
            icon: Music,
            title: 'Text to Music',
            description:
                'Create soundtracks instantly. Stable Audio, MusicGen, and more.',
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
        },
    ];
</script>

<AppHead title="Video Editor for the Next Generation of Makers" />

<div class="min-h-screen bg-background text-foreground">
    <!-- Sticky Navigation -->
    <header
        class="sticky top-0 z-50 w-full border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
        <div class="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div class="flex items-center gap-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                    <Play class="h-4 w-4 text-primary-foreground" />
                </div>
                <span class="text-lg font-semibold">VideoEditor</span>
            </div>

            <nav class="flex items-center gap-3">
                {#if auth.user}
                    <Button asChild>
                        {#snippet children(props)}
                            <Link href={toUrl(dashboard())} {...props}>
                                Go to Dashboard
                                <ArrowRight class="h-4 w-4" />
                            </Link>
                        {/snippet}
                    </Button>
                {:else}
                    <Button variant="ghost" asChild>
                        {#snippet children(props)}
                            <Link href={toUrl(login())} {...props}>
                                Sign In
                            </Link>
                        {/snippet}
                    </Button>
                    {#if canRegister}
                        <Button asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(register())} {...props}>
                                    Get Started
                                    <ArrowRight class="h-4 w-4" />
                                </Link>
                            {/snippet}
                        </Button>
                    {/if}
                {/if}
            </nav>
        </div>
    </header>

    <!-- Hero Section -->
    <section class="relative overflow-hidden">
        <!-- Gradient accent -->
        <div
            class="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
        >
            <div
                class="absolute -top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 rounded-full bg-gradient-to-br from-violet-500/20 via-blue-500/10 to-transparent blur-3xl"
            ></div>
        </div>

        <div class="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8 lg:py-40">
            <div class="mx-auto max-w-3xl text-center">
                <Badge class="mb-6">
                    <Sparkles class="h-3 w-3" />
                    AI-Powered Video Creation
                </Badge>

                <h1
                    class="text-5xl font-bold tracking-tight md:text-6xl lg:text-7xl"
                >
                    Create videos that{' '}
                    <span
                        class="bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent"
                        >move people</span
                    >.
                </h1>

                <p class="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
                    No crew. No budget. Just you and the power of AI.
                    <br class="hidden sm:block" />
                    The video editor built for the next generation of makers.
                </p>

                <div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    {#if auth.user}
                        <Button size="lg" asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(dashboard())} {...props}>
                                    Open Editor
                                    <ArrowRight class="h-4 w-4" />
                                </Link>
                            {/snippet}
                        </Button>
                    {:else}
                        <Button size="lg" asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(register())} {...props}>
                                    Start Creating
                                    <ArrowRight class="h-4 w-4" />
                                </Link>
                            {/snippet}
                        </Button>
                        <Button variant="outline" size="lg" asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(login())} {...props}>
                                    Sign In
                                </Link>
                            {/snippet}
                        </Button>
                    {/if}
                </div>
            </div>
        </div>
    </section>

    <!-- Features Section -->
    <section class="border-t border-border/40 bg-muted/30 py-24 sm:py-32">
        <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div class="mx-auto max-w-2xl text-center">
                <h2 class="text-3xl font-bold tracking-tight md:text-4xl">
                    AI does the heavy lifting.
                </h2>
                <p class="mt-4 text-lg text-muted-foreground">
                    Generate stunning visuals, voices, and music with simple
                    prompts.
                </p>
            </div>

            <div class="mx-auto mt-16 grid max-w-5xl gap-6 sm:grid-cols-2 lg:gap-8">
                {#each features as feature}
                    <Card class="border-border/50 transition-shadow hover:shadow-md">
                        <CardContent class="flex flex-col gap-4 pt-6">
                            <div
                                class="flex h-12 w-12 items-center justify-center rounded-lg {feature.bgColor}"
                            >
                                <feature.icon class="h-6 w-6 {feature.color}" />
                            </div>
                            <div>
                                <h3 class="text-lg font-semibold">
                                    {feature.title}
                                </h3>
                                <p class="mt-1 text-muted-foreground">
                                    {feature.description}
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                {/each}
            </div>
        </div>
    </section>

    <!-- Founder Story Section -->
    <section class="py-24 sm:py-32">
        <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div class="mx-auto max-w-3xl">
                <!-- Opening quote -->
                <blockquote
                    class="text-center text-2xl font-medium leading-relaxed md:text-3xl"
                >
                    "After 10 years building software, I realized something:
                    <span class="text-muted-foreground"
                        >the best ideas often die because they can't be shown,
                        only told.</span
                    >"
                </blockquote>

                <Separator class="mx-auto my-12 max-w-xs" />

                <!-- Story -->
                <div class="space-y-6 text-lg leading-relaxed text-muted-foreground">
                    <p>
                        I'm Samuel. Solo founder, CTO, developer. For over a
                        decade, I've been building products and companies from
                        scratch.
                    </p>
                    <p>
                        But here's what nobody tells you: the hardest part isn't
                        writing code or managing teams. It's <span
                            class="text-foreground font-medium"
                            >communicating your vision</span
                        >.
                    </p>
                    <p>
                        I'd spend hours explaining an idea in meetings, only to
                        watch eyes glaze over. I'd write detailed documents that
                        nobody read. Hiring video editors was expensive.
                        Learning professional tools took months I didn't have.
                    </p>
                    <p>
                        Then generative AI changed everything.
                    </p>
                    <p>
                        Suddenly, I could generate images from descriptions.
                        Turn images into video. Create voiceovers and music
                        without touching a microphone or instrument. <span
                            class="text-foreground font-medium"
                            >I could finally show what I meant.</span
                        >
                    </p>
                    <p>
                        I built this editor for people like me. People with
                        ideas worth sharing but without the time, budget, or
                        skills for traditional video production.
                    </p>
                </div>

                <Separator class="mx-auto my-12 max-w-xs" />

                <!-- Mission -->
                <div class="text-center">
                    <h3 class="text-2xl font-bold md:text-3xl">
                        For the next generation of makers.
                    </h3>
                    <p class="mt-4 text-lg text-muted-foreground">
                        Thanks to AI, we can now communicate better than ever
                        before.
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- Final CTA Section -->
    <section class="border-t border-border/40 bg-muted/30 py-24 sm:py-32">
        <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div class="mx-auto max-w-2xl text-center">
                <h2 class="text-3xl font-bold tracking-tight md:text-4xl">
                    Your ideas are waiting.
                </h2>
                <p class="mt-4 text-lg text-muted-foreground">
                    Stop explaining. Start showing.
                </p>

                <div class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
                    {#if auth.user}
                        <Button size="lg" asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(dashboard())} {...props}>
                                    Open Editor
                                    <ArrowRight class="h-4 w-4" />
                                </Link>
                            {/snippet}
                        </Button>
                    {:else}
                        <Button size="lg" asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(register())} {...props}>
                                    Get Started Free
                                    <ArrowRight class="h-4 w-4" />
                                </Link>
                            {/snippet}
                        </Button>
                        {#if canRegister}
                            <Button variant="outline" size="lg" asChild>
                                {#snippet children(props)}
                                    <Link href={toUrl(login())} {...props}>
                                        Sign In
                                    </Link>
                                {/snippet}
                            </Button>
                        {/if}
                    {/if}
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-border/40 py-8">
        <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <p class="text-center text-sm text-muted-foreground">
                Built for makers, by a maker.
            </p>
        </div>
    </footer>
</div>
