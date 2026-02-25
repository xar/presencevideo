<script lang="ts">
    import { Link, page } from '@inertiajs/svelte';
    import AppHead from '@/components/AppHead.svelte';
    import { toUrl } from '@/lib/utils';
    import { login, register } from '@/routes';
    import editor from '@/routes/editor';
    import Button from '@/components/ui/button/Button.svelte';
    import DemoEditor from '@/components/editor/DemoEditor.svelte';
    import {
        Sparkles,
        Video,
        Image,
        Music,
        Mic,
        ArrowRight,
        Play,
        Layers,
        Wand2,
        Zap,
        Star
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
            borderColor: 'group-hover:border-violet-500/50',
            shadowColor: 'hover:shadow-violet-500/10',
        },
        {
            icon: Video,
            title: 'Image to Video',
            description:
                'Bring your images to life. MiniMax, Kling, Luma Dream Machine.',
            color: 'text-blue-500',
            bgColor: 'bg-blue-500/10',
            borderColor: 'group-hover:border-blue-500/50',
            shadowColor: 'hover:shadow-blue-500/10',
        },
        {
            icon: Mic,
            title: 'Text to Speech',
            description:
                'Natural voiceovers that sound human. Multiple voices and languages.',
            color: 'text-emerald-500',
            bgColor: 'bg-emerald-500/10',
            borderColor: 'group-hover:border-emerald-500/50',
            shadowColor: 'hover:shadow-emerald-500/10',
        },
        {
            icon: Music,
            title: 'Text to Music',
            description:
                'Create soundtracks instantly. Stable Audio, MusicGen, and more.',
            color: 'text-amber-500',
            bgColor: 'bg-amber-500/10',
            borderColor: 'group-hover:border-amber-500/50',
            shadowColor: 'hover:shadow-amber-500/10',
        },
    ];
</script>

<AppHead title="AI Video Editor for Makers" />

<div class="min-h-screen bg-background text-foreground selection:bg-primary/20">
    <!-- Sticky Navigation -->
    <header
        class="fixed top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 transition-all duration-300"
    >
        <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div class="flex items-center gap-2 group cursor-pointer">
                <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
                    <Play class="h-4 w-4 text-primary-foreground ml-0.5" />
                </div>
                <span class="text-xl font-bold tracking-tight">Presence</span>
            </div>

            <nav class="flex items-center gap-4">
                {#if auth.user}
                    <Button asChild class="rounded-full shadow-sm group">
                        {#snippet children(props)}
                            <Link href={toUrl(editor.index())} {...props}>
                                My Projects
                                <ArrowRight class="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
                            </Link>
                        {/snippet}
                    </Button>
                {:else}
                    <Button variant="ghost" class="rounded-full hidden sm:flex" asChild>
                        {#snippet children(props)}
                            <Link href={toUrl(login())} {...props}>
                                Sign In
                            </Link>
                        {/snippet}
                    </Button>
                    {#if canRegister}
                        <Button asChild class="rounded-full shadow-sm group">
                            {#snippet children(props)}
                                <Link href={toUrl(register())} {...props}>
                                    Get Started
                                    <ArrowRight class="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" />
                                </Link>
                            {/snippet}
                        </Button>
                    {/if}
                {/if}
            </nav>
        </div>
    </header>

    <main class="pt-16">
        <!-- Hero Section -->
        <section class="relative overflow-hidden pb-24 pt-32 sm:pt-40 lg:pb-32 lg:pt-48">
            <!-- Grid Background -->
            <div class="absolute inset-0 -z-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]"></div>
            
            <!-- Glowing Orbs -->
            <div class="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
                <div class="absolute -top-[20%] left-[20%] h-[500px] w-[500px] rounded-full bg-violet-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen"></div>
                <div class="absolute -top-[10%] right-[20%] h-[600px] w-[600px] rounded-full bg-blue-500/20 blur-[120px] mix-blend-multiply dark:mix-blend-screen"></div>
            </div>

            <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="mx-auto max-w-4xl text-center">
                    <div class="inline-flex items-center rounded-full border border-border/50 bg-background/50 px-3 py-1 text-sm font-medium backdrop-blur-md mb-8 shadow-sm">
                        <Sparkles class="h-4 w-4 mr-2 text-violet-500" />
                        <span class="bg-gradient-to-r from-violet-500 to-blue-500 bg-clip-text text-transparent">AI-Powered Video Creation 2.0</span>
                    </div>

                    <h1 class="text-5xl font-extrabold tracking-tight md:text-7xl lg:text-8xl/none mb-8">
                        Videos that <br class="hidden sm:block" />
                        <span class="relative whitespace-nowrap">
                            <span class="absolute -inset-1 block -skew-y-3 bg-gradient-to-r from-violet-500 to-blue-500"></span>
                            <span class="relative text-white">move people.</span>
                        </span>
                    </h1>

                    <p class="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed mb-10">
                        No crew. No budget. Just you and the power of AI.
                        The intuitive editor built for the next generation of visual storytellers.
                    </p>

                    <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
                        {#if auth.user}
                            <Button size="lg" class="relative overflow-hidden rounded-full h-12 px-8 text-base shadow-lg shadow-primary/20 group" asChild>
                                {#snippet children(props)}
                                    <Link href={toUrl(editor.index())} {...props}>
                                        <div class="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></div>
                                        <span class="relative z-10 flex items-center">
                                            My Projects
                                            <ArrowRight class="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                                        </span>
                                    </Link>
                                {/snippet}
                            </Button>
                        {:else}
                            <Button size="lg" class="relative overflow-hidden rounded-full h-12 px-8 text-base shadow-lg shadow-primary/20 group" asChild>
                                {#snippet children(props)}
                                    <Link href={toUrl(register())} {...props}>
                                        <div class="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></div>
                                        <span class="relative z-10 flex items-center">
                                            Start Creating Free
                                            <Wand2 class="h-4 w-4 ml-2 transition-transform group-hover:rotate-12" />
                                        </span>
                                    </Link>
                                {/snippet}
                            </Button>
                            <Button variant="outline" size="lg" class="rounded-full h-12 px-8 text-base bg-background/50 backdrop-blur-sm hover:bg-muted/50" asChild>
                                {#snippet children(props)}
                                    <Link href={toUrl(login())} {...props}>
                                        Sign In
                                    </Link>
                                {/snippet}
                            </Button>
                        {/if}
                    </div>

                    <!-- Social Proof Avatar Group -->
                    <div class="mt-10 flex flex-col items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300 fill-mode-both">
                        <div class="flex -space-x-3">
                            <img class="h-10 w-10 rounded-full border-2 border-background shadow-sm" src="https://i.pravatar.cc/100?img=33" alt="Creator" />
                            <img class="h-10 w-10 rounded-full border-2 border-background shadow-sm" src="https://i.pravatar.cc/100?img=47" alt="Creator" />
                            <img class="h-10 w-10 rounded-full border-2 border-background shadow-sm" src="https://i.pravatar.cc/100?img=12" alt="Creator" />
                            <img class="h-10 w-10 rounded-full border-2 border-background shadow-sm" src="https://i.pravatar.cc/100?img=5" alt="Creator" />
                            <div class="flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-muted text-xs font-semibold text-foreground shadow-sm">+2k</div>
                        </div>
                        <div class="flex items-center gap-2 text-sm text-muted-foreground">
                            <div class="flex text-amber-500">
                                <Star class="h-3.5 w-3.5 fill-current" />
                                <Star class="h-3.5 w-3.5 fill-current" />
                                <Star class="h-3.5 w-3.5 fill-current" />
                                <Star class="h-3.5 w-3.5 fill-current" />
                                <Star class="h-3.5 w-3.5 fill-current" />
                            </div>
                            <span>Joined by 2,000+ modern creators</span>
                        </div>
                    </div>
                </div>

            </div>

            <!-- Live Editor Demo -->
            {#if !auth.user}
                <div class="mx-auto mt-20 max-w-7xl px-4 sm:px-6 lg:px-8">
                    <DemoEditor {canRegister} />
                </div>
            {/if}
        </section>

        <!-- Features Section -->
        <section class="relative border-t border-border/40 bg-muted/10 py-24 sm:py-32 overflow-hidden">
            <div class="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[800px] bg-primary/5 blur-[100px] rounded-full pointer-events-none"></div>
            
            <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="mx-auto max-w-2xl text-center mb-16">
                    <h2 class="text-3xl font-bold tracking-tight md:text-5xl mb-4">
                        AI does the heavy lifting.
                    </h2>
                    <p class="text-lg text-muted-foreground">
                        Generate stunning visuals, natural voices, and original music with just a few words. Our platform integrates the best models seamlessly.
                    </p>
                </div>

                <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    {#each features as feature}
                        <div class="group relative rounded-2xl border border-border/50 bg-background/50 p-6 transition-all hover:-translate-y-1 hover:shadow-xl {feature.shadowColor} {feature.borderColor} backdrop-blur-sm">
                            <div class="mb-4 flex h-12 w-12 items-center justify-center rounded-xl {feature.bgColor} transition-transform group-hover:scale-110">
                                <feature.icon class="h-6 w-6 {feature.color}" />
                            </div>
                            <h3 class="mb-2 text-xl font-semibold tracking-tight">
                                {feature.title}
                            </h3>
                            <p class="text-sm text-muted-foreground leading-relaxed">
                                {feature.description}
                            </p>
                        </div>
                    {/each}
                </div>
            </div>
        </section>

        <!-- Founder Story Section -->
        <section class="py-24 sm:py-32 relative">
            <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
                <!-- Opening quote -->
                <div class="relative">
                    <div class="absolute -left-4 -top-8 text-6xl text-muted/30 font-serif">"</div>
                    <blockquote class="text-center text-3xl font-medium leading-tight md:text-4xl tracking-tight mb-16">
                        After 10 years building software, I realized something:
                        <span class="text-muted-foreground block mt-2">the best ideas often die because they can't be shown, only told.</span>
                    </blockquote>
                </div>

                <div class="grid md:grid-cols-2 gap-12 items-center">
                    <div class="space-y-6 text-lg leading-relaxed text-muted-foreground">
                        <p>
                            I'm Samuel. Solo founder, developer. For over a decade, I've been building products from scratch.
                        </p>
                        <p>
                            The hardest part isn't writing code. It's <strong class="text-foreground font-semibold">communicating your vision</strong>. I'd spend hours explaining an idea, only to watch eyes glaze over.
                        </p>
                        <p>
                            Then generative AI changed everything. I could finally show what I meant instantly.
                        </p>
                        <p>
                            I built this editor for people with ideas worth sharing, but without the time or budget for traditional video production.
                        </p>
                    </div>
                    <div class="relative">
                        <div class="aspect-square rounded-2xl border border-border/50 bg-gradient-to-br from-muted to-muted/30 p-8 flex flex-col items-center justify-center text-center shadow-lg relative overflow-hidden">
                            <div class="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px]"></div>
                            <Zap class="h-12 w-12 text-amber-500 mb-4 relative z-10" />
                            <h3 class="text-2xl font-bold relative z-10">For the next generation of makers.</h3>
                            <p class="mt-2 text-sm text-muted-foreground relative z-10">Communicate better than ever before.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Final CTA Section -->
        <section class="relative border-t border-border/40 py-24 sm:py-32 overflow-hidden">
            <div class="absolute inset-0 bg-primary/5"></div>
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] bg-violet-500/10 blur-[100px] rounded-full"></div>
            
            <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 relative z-10 text-center">
                <Layers class="h-16 w-16 mx-auto mb-6 text-primary" />
                <h2 class="text-4xl font-extrabold tracking-tight md:text-6xl mb-6">
                    Your ideas are waiting.
                </h2>
                <p class="mx-auto max-w-xl text-xl text-muted-foreground mb-10">
                    Stop explaining. Start showing. Join thousands of creators bringing their vision to life.
                </p>

                <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
                    {#if auth.user}
                        <Button size="lg" class="rounded-full h-14 px-10 text-lg shadow-xl shadow-primary/20 group" asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(editor.index())} {...props}>
                                    My Projects
                                    <ArrowRight class="h-5 w-5 ml-2 transition-transform group-hover:translate-x-1" />
                                </Link>
                            {/snippet}
                        </Button>
                    {:else}
                        <Button size="lg" class="rounded-full h-14 px-10 text-lg shadow-xl shadow-primary/20 group" asChild>
                            {#snippet children(props)}
                                <Link href={toUrl(register())} {...props}>
                                    Get Started Free
                                    <ArrowRight class="h-5 w-5 ml-2 transition-transform group-hover:translate-x-1" />
                                </Link>
                            {/snippet}
                        </Button>
                        {#if canRegister}
                            <Button variant="outline" size="lg" class="rounded-full h-14 px-10 text-lg bg-background/50 backdrop-blur-sm" asChild>
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
        </section>
    </main>

    <!-- Footer -->
    <footer class="border-t border-border/40 bg-background py-8 relative z-10">
        <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-4">
            <div class="flex items-center gap-2">
                <div class="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
                    <Play class="h-3 w-3 text-primary-foreground ml-0.5" />
                </div>
                <span class="font-semibold tracking-tight text-sm">Presence</span>
            </div>
            <p class="text-sm text-muted-foreground text-center">
                Built for makers, by a maker. &copy; {new Date().getFullYear()} All rights reserved.
            </p>
        </div>
    </footer>
</div>
