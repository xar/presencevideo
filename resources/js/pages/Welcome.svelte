<script lang="ts">
    import { Link, page } from '@inertiajs/svelte';
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
    import AppHead from '@/components/AppHead.svelte';
    import DemoEditor from '@/components/editor/DemoEditor.svelte';
    import Button from '@/components/ui/button/Button.svelte';
    import Separator from '@/components/ui/separator/Separator.svelte';
    import { toUrl } from '@/lib/utils';
    import { login, register } from '@/routes';
    import editor from '@/routes/editor';

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

<div class="min-h-screen bg-background text-foreground selection:bg-primary/20 overflow-x-hidden">
    <!-- Floating Pill Navigation -->
    <div class="fixed top-6 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
        <header class="pointer-events-auto flex w-full max-w-4xl items-center justify-between rounded-full border border-white/10 bg-background/60 px-4 py-3 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-300">
            <div class="flex items-center gap-2 group cursor-pointer pl-2">
                <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
                    <Play class="h-4 w-4 text-primary-foreground ml-0.5" />
                </div>
                <span class="text-xl font-bold tracking-tight">Presence</span>
            </div>

            <nav class="flex items-center gap-2 sm:gap-4">
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
        </header>
    </div>

    <main class="pt-24 relative z-10">
        <!-- Hero Section -->
        <section class="relative pb-24 pt-20 sm:pt-32 lg:pb-32 lg:pt-40 overflow-hidden">
            <!-- Dynamic ambient background -->
            <div class="absolute inset-0 -z-20 bg-background overflow-hidden pointer-events-none">
                <!-- Extremely subtle top glow -->
                <div class="absolute -top-1/2 left-1/2 -translate-x-1/2 w-[1000px] h-[800px] opacity-20 pointer-events-none" style="background: radial-gradient(circle at center, var(--color-violet-500) 0%, transparent 60%); filter: blur(100px);"></div>
            </div>

            <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10 flex flex-col items-center">
                
                <!-- Pill Badge -->
                <div class="inline-flex items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1.5 text-sm font-medium backdrop-blur-sm mb-12 shadow-sm hover:bg-muted/50 transition-colors cursor-pointer group">
                    <span class="flex h-2 w-2 rounded-full bg-violet-500 mr-2 animate-pulse"></span>
                    <span class="text-foreground/90">Presence 2.0 is now live</span>
                    <Separator orientation="vertical" class="mx-3 h-4" />
                    <span class="text-muted-foreground flex items-center group-hover:text-foreground transition-colors">
                        Read announcement <ArrowRight class="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </div>

                <!-- Clean, Monolithic Typography -->
                <div class="max-w-4xl text-center flex flex-col items-center">
                    <h1 class="text-5xl font-semibold tracking-tighter sm:text-6xl md:text-7xl lg:text-[6rem] leading-[1.05] mb-8 text-foreground">
                        Video editing, <br class="hidden sm:block" />
                        reimagined for creators.
                    </h1>

                    <p class="max-w-2xl text-lg text-muted-foreground md:text-xl leading-relaxed mb-10 font-normal">
                        Generate visual stories from simple text. No timeline complexity, no missing assets. Just pure creative flow powered by state-of-the-art AI.
                    </p>

                    <div class="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
                        {#if auth.user}
                            <Button size="lg" class="w-full sm:w-auto rounded-full h-12 px-8 text-base shadow-sm group bg-foreground text-background hover:bg-foreground/90 transition-all hover:scale-105" asChild>
                                {#snippet children(props)}
                                    <Link href={toUrl(editor.index())} {...props}>
                                        <span class="flex items-center font-medium">
                                            Open Dashboard
                                            <ArrowRight class="h-4 w-4 ml-2 transition-transform group-hover:translate-x-1" />
                                        </span>
                                    </Link>
                                {/snippet}
                            </Button>
                        {:else}
                            <Button size="lg" class="w-full sm:w-auto rounded-full h-12 px-8 text-base shadow-sm group bg-foreground text-background hover:bg-foreground/90 transition-all hover:scale-105" asChild>
                                {#snippet children(props)}
                                    <Link href={toUrl(register())} {...props}>
                                        <span class="flex items-center font-medium">
                                            Start for free
                                        </span>
                                    </Link>
                                {/snippet}
                            </Button>
                            <Button variant="outline" size="lg" class="w-full sm:w-auto rounded-full h-12 px-8 text-base bg-background border-border hover:bg-muted font-medium transition-all" asChild>
                                {#snippet children(props)}
                                    <Link href={toUrl(login())} {...props}>
                                        <Play class="h-4 w-4 mr-2" /> Book a demo
                                    </Link>
                                {/snippet}
                            </Button>
                        {/if}
                    </div>
                </div>

                <!-- Minimalist Social Proof -->
                <div class="mt-20 flex flex-col items-center justify-center gap-6">
                    <p class="text-xs text-muted-foreground/60 font-semibold tracking-widest uppercase">Trusted by forward-thinking teams</p>
                    <div class="flex flex-wrap justify-center items-center gap-x-12 gap-y-6 opacity-40 grayscale mix-blend-luminosity hover:opacity-60 transition-opacity">
                        <!-- Cleaner Logos -->
                        <div class="flex items-center gap-2 font-bold text-lg tracking-tight"><div class="h-6 w-6 rounded bg-foreground"></div> ACME</div>
                        <div class="flex items-center gap-2 font-bold text-lg tracking-tight"><div class="h-6 w-6 rounded-full border-4 border-foreground"></div> GLOBEX</div>
                        <div class="hidden sm:flex items-center gap-2 font-bold text-lg tracking-tight"><div class="h-0 w-6 border-b-4 border-t-4 border-foreground h-6"></div> STARK</div>
                    </div>
                </div>
            </div>

            <!-- Sleek App Preview Window -->
            {#if !auth.user}
                <div class="mx-auto mt-24 max-w-6xl px-4 sm:px-6 lg:px-8 relative z-10">
                    <!-- Beautiful drop shadow and glow for the editor -->
                    <div class="absolute -inset-1 bg-gradient-to-r from-violet-500/20 to-blue-500/20 blur-2xl opacity-50 rounded-[2rem]"></div>
                    <div class="relative rounded-2xl border border-border/40 bg-background/50 backdrop-blur-xl shadow-2xl p-2 md:p-3 ring-1 ring-white/5">
                        <div class="rounded-xl overflow-hidden border border-border/50 bg-card shadow-inner">
                            <!-- Faux Mac window controls -->
                            <div class="flex items-center h-12 px-4 border-b border-border/50 bg-muted/30">
                                <div class="flex gap-2">
                                    <div class="w-3 h-3 rounded-full bg-border hover:bg-red-500 transition-colors"></div>
                                    <div class="w-3 h-3 rounded-full bg-border hover:bg-amber-500 transition-colors"></div>
                                    <div class="w-3 h-3 rounded-full bg-border hover:bg-green-500 transition-colors"></div>
                                </div>
                                <div class="mx-auto flex items-center justify-center h-6 px-3 rounded-md bg-background/50 border border-border/50 text-xs font-medium text-muted-foreground shadow-sm">
                                    <Sparkles class="w-3 h-3 mr-1.5" /> Untitled Project
                                </div>
                            </div>
                            <DemoEditor {canRegister} />
                        </div>
                    </div>
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

                <!-- Bento Box Grid -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(250px,auto)]">
                    
                    <!-- Text to Image (Spans 2 cols) -->
                    <div class="md:col-span-2 group relative overflow-hidden rounded-3xl border border-border/50 bg-background/50 p-8 sm:p-10 transition-all hover:shadow-2xl hover:shadow-violet-500/10 backdrop-blur-sm">
                        <div class="absolute top-0 right-0 -mt-8 -mr-8 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl transition-transform duration-700 group-hover:scale-150"></div>
                        <div class="relative z-10 max-w-sm">
                            <div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10 text-violet-500">
                                <Image class="h-7 w-7" />
                            </div>
                            <h3 class="mb-3 text-3xl font-bold tracking-tight">Text to Image</h3>
                            <p class="text-lg text-muted-foreground leading-relaxed">Generate stunning visuals from words. Integrated with FLUX, Stable Diffusion, and premium models.</p>
                        </div>
                        <div class="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 opacity-10 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none">
                            <Image class="w-[280px] h-[280px] text-violet-500" />
                        </div>
                    </div>

                    <!-- Image to Video (Spans 1 col) -->
                    <div class="md:col-span-1 group relative overflow-hidden rounded-3xl border border-border/50 bg-background/50 p-8 sm:p-10 transition-all hover:shadow-2xl hover:shadow-blue-500/10 backdrop-blur-sm flex flex-col justify-between">
                        <div class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div class="relative z-10">
                            <div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-500">
                                <Video class="h-7 w-7" />
                            </div>
                            <h3 class="mb-3 text-2xl font-bold tracking-tight">Image to Video</h3>
                            <p class="text-base text-muted-foreground leading-relaxed">Bring your static images to life with cinematic motion and depth.</p>
                        </div>
                    </div>

                    <!-- Text to Speech (Spans 1 col) -->
                    <div class="md:col-span-1 group relative overflow-hidden rounded-3xl border border-border/50 bg-background/50 p-8 sm:p-10 transition-all hover:shadow-2xl hover:shadow-emerald-500/10 backdrop-blur-sm flex flex-col justify-between">
                        <div class="absolute inset-0 bg-gradient-to-tr from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                        <div class="relative z-10">
                            <div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                                <Mic class="h-7 w-7" />
                            </div>
                            <h3 class="mb-3 text-2xl font-bold tracking-tight">Text to Speech</h3>
                            <p class="text-base text-muted-foreground leading-relaxed">Natural voiceovers that sound human in multiple languages.</p>
                        </div>
                    </div>

                    <!-- Text to Music (Spans 2 cols) -->
                    <div class="md:col-span-2 group relative overflow-hidden rounded-3xl border border-border/50 bg-background/50 p-8 sm:p-10 transition-all hover:shadow-2xl hover:shadow-amber-500/10 backdrop-blur-sm flex flex-col justify-end">
                        <div class="absolute bottom-0 left-0 -mb-8 -ml-8 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl transition-transform duration-700 group-hover:scale-150"></div>
                        <div class="absolute right-0 top-0 -mt-10 mr-10 opacity-10 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none">
                            <Music class="w-[280px] h-[280px] text-amber-500" />
                        </div>
                        <div class="relative z-10 max-w-sm mt-auto">
                            <div class="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500">
                                <Music class="h-7 w-7" />
                            </div>
                            <h3 class="mb-3 text-3xl font-bold tracking-tight">Text to Music</h3>
                            <p class="text-lg text-muted-foreground leading-relaxed">Create soundtracks instantly. Build the perfect mood with Stable Audio and MusicGen.</p>
                        </div>
                    </div>

                </div>
            </div>
        </section>

        <!-- Founder Story Section - Typography Focused -->
        <section class="relative overflow-hidden bg-foreground text-background py-32 sm:py-40">
            <!-- Subtle noise pattern overlay for premium feel -->
            <div class="absolute inset-0 opacity-[0.03] mix-blend-difference pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E')]"></div>
            
            <!-- Large abstract typographic watermark -->
            <div class="absolute -top-24 left-0 -z-0 opacity-[0.03] text-[20vw] font-black tracking-tighter whitespace-nowrap select-none pointer-events-none">
                PRESENCE
            </div>

            <div class="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 relative z-10">
                <div class="max-w-4xl">
                    <h2 class="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05] mb-16 text-balance">
                        "After 10 years building software, I realized something. 
                        <span class="text-background/40">The best ideas often die because they can't be shown, only told.</span>"
                    </h2>
                </div>

                <div class="grid md:grid-cols-4 gap-8 pt-12 border-t border-background/20 mt-16">
                    <div class="md:col-span-1">
                        <div class="flex items-center gap-4 mb-4">
                            <div class="h-12 w-12 rounded-full bg-background/20 overflow-hidden border border-background/30 flex items-center justify-center">
                                <!-- Abstract avatar placeholder -->
                                <Zap class="h-5 w-5 text-background" />
                            </div>
                            <div>
                                <p class="font-bold text-lg leading-tight">Samuel</p>
                                <p class="text-background/60 text-sm">Founder & Developer</p>
                            </div>
                        </div>
                    </div>
                    <div class="md:col-span-3 text-lg md:text-xl text-background/70 space-y-6 max-w-3xl leading-relaxed">
                        <p>
                            The hardest part isn't writing code. It's <strong class="text-background font-semibold">communicating your vision</strong>. I'd spend hours explaining an idea, only to watch eyes glaze over.
                        </p>
                        <p>
                            Then generative AI changed everything. I could finally show what I meant instantly.
                        </p>
                        <p>
                            I built this editor for people with ideas worth sharing, but without the time or budget for traditional video production.
                        </p>
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
