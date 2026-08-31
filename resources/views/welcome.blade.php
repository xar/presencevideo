<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>AI Video Creation with Control - {{ config('app.name', 'usekeyframes.com') }}</title>
        <meta name="description" content="Create cinematic videos from prompts, images, voice, and music with keyframe-level control.">
        <link rel="canonical" href="{{ route('home') }}">
        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        @vite(['resources/css/app.css', 'resources/js/islands/demo-editor.ts'])
    </head>
    <body class="bg-background text-foreground antialiased selection:bg-primary/20">
        <div class="min-h-screen overflow-x-hidden bg-background text-foreground">
            <div class="fixed top-6 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
                <header class="pointer-events-auto flex w-full max-w-4xl items-center justify-between rounded-full border border-white/10 bg-background/60 px-4 py-3 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-300">
                    <a href="{{ route('home') }}" class="flex items-center gap-2 group pl-2">
                        <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
                            <svg class="h-4 w-4 text-primary-foreground ml-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                        </div>
                        <span class="text-xl font-bold tracking-tight">usekeyframes.com</span>
                    </a>

                    <nav class="flex items-center gap-2 sm:gap-4">
                        @auth
                            <a href="{{ route('editor.index') }}" class="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 group">
                                My Projects
                                <svg class="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                            </a>
                        @else
                            <a href="{{ route('login') }}" class="hidden h-9 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-flex">Sign In</a>
                            @if ($canRegister)
                                <a href="{{ route('register') }}" class="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 group">
                                    Get Started
                                    <svg class="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                                </a>
                            @endif
                        @endauth
                    </nav>
                </header>
            </div>

            <main class="relative z-10 pt-24">
                <section class="relative overflow-hidden pb-24 pt-20 sm:pt-32 lg:pb-32 lg:pt-40">
                    <div class="absolute inset-0 -z-20 overflow-hidden bg-background pointer-events-none">
                        <div class="absolute -top-1/2 left-1/2 h-[800px] w-[1000px] -translate-x-1/2 opacity-20 pointer-events-none" style="background: radial-gradient(circle at center, var(--color-violet-500) 0%, transparent 60%); filter: blur(100px);"></div>
                    </div>

                    <div class="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-4 sm:px-6 lg:px-8">
                        <a href="{{ route('seo.blog.index') }}" class="mb-12 inline-flex cursor-pointer items-center rounded-full border border-border/40 bg-muted/30 px-3 py-1.5 text-sm font-medium backdrop-blur-sm shadow-sm transition-colors hover:bg-muted/50 group">
                            <span class="mr-2 flex h-2 w-2 rounded-full bg-violet-500 animate-pulse"></span>
                            <span class="text-foreground/90">Private beta is now live</span>
                            <span class="mx-3 h-4 w-px bg-border"></span>
                            <span class="flex items-center text-muted-foreground transition-colors group-hover:text-foreground">Read announcement <svg class="ml-1 h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></span>
                        </a>

                        <div class="flex max-w-4xl flex-col items-center text-center">
                            <h1 class="mb-8 text-5xl font-semibold leading-[1.05] tracking-tighter text-foreground sm:text-6xl md:text-7xl lg:text-[6rem]">
                                AI video, <br class="hidden sm:block"> directed by keyframes.
                            </h1>
                            <p class="mb-10 max-w-2xl text-lg font-normal leading-relaxed text-muted-foreground md:text-xl">
                                Create cinematic videos from prompts, images, voice, and music — with the control to shape motion, timing, and story frame by frame.
                            </p>
                            <div class="flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
                                @auth
                                    <a href="{{ route('editor.index') }}" class="inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background shadow-sm transition-all hover:scale-105 hover:bg-foreground/90 sm:w-auto group">Open Dashboard <svg class="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg></a>
                                @else
                                    @if ($canRegister)
                                        <a href="{{ route('register') }}" class="inline-flex h-12 w-full items-center justify-center rounded-full bg-foreground px-8 text-base font-medium text-background shadow-sm transition-all hover:scale-105 hover:bg-foreground/90 sm:w-auto">Start for free</a>
                                    @endif
                                    <a href="{{ route('login') }}" class="inline-flex h-12 w-full items-center justify-center rounded-full border border-border bg-background px-8 text-base font-medium transition-all hover:bg-muted sm:w-auto"><svg class="mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3" /></svg> Book a demo</a>
                                @endauth
                            </div>
                        </div>

                        <div class="mt-20 flex flex-col items-center justify-center gap-6">
                            <p class="text-xs font-semibold uppercase tracking-widest text-muted-foreground/60">Trusted by forward-thinking teams</p>
                            <div class="flex flex-wrap items-center justify-center gap-x-12 gap-y-6 opacity-40 grayscale mix-blend-luminosity transition-opacity hover:opacity-60">
                                <div class="flex items-center gap-2 text-lg font-bold tracking-tight"><div class="h-6 w-6 rounded bg-foreground"></div> ACME</div>
                                <div class="flex items-center gap-2 text-lg font-bold tracking-tight"><div class="h-6 w-6 rounded-full border-4 border-foreground"></div> GLOBEX</div>
                                <div class="hidden items-center gap-2 text-lg font-bold tracking-tight sm:flex"><div class="h-6 w-6 border-b-4 border-t-4 border-foreground"></div> STARK</div>
                            </div>
                        </div>
                    </div>

                    @guest
                        <div class="relative z-10 mx-auto mt-24 max-w-6xl px-4 sm:px-6 lg:px-8">
                            <div class="absolute -inset-1 rounded-[2rem] bg-gradient-to-r from-violet-500/20 to-blue-500/20 opacity-50 blur-2xl"></div>
                            <div class="relative rounded-2xl border border-border/40 bg-background/50 p-2 shadow-2xl ring-1 ring-white/5 backdrop-blur-xl md:p-3">
                                <div class="overflow-hidden rounded-xl border border-border/50 bg-card shadow-inner">
                                    <div class="flex h-12 items-center border-b border-border/50 bg-muted/30 px-4">
                                        <div class="flex gap-2"><div class="h-3 w-3 rounded-full bg-border"></div><div class="h-3 w-3 rounded-full bg-border"></div><div class="h-3 w-3 rounded-full bg-border"></div></div>
                                        <div class="mx-auto flex h-6 items-center justify-center rounded-md border border-border/50 bg-background/50 px-3 text-xs font-medium text-muted-foreground shadow-sm">Untitled Project</div>
                                    </div>
                                    <div id="demo-editor" data-can-register="{{ $canRegister ? 'true' : 'false' }}"></div>
                                </div>
                            </div>
                        </div>
                    @endguest
                </section>

                <section class="relative overflow-hidden border-t border-border/40 bg-muted/10 py-24 sm:py-32">
                    <div class="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div class="mx-auto mb-16 max-w-2xl text-center">
                            <h2 class="mb-4 text-3xl font-bold tracking-tight md:text-5xl">Generate the assets. Control the motion.</h2>
                            <p class="text-lg text-muted-foreground">Bring images, video, voice, and music into one AI-native creative workspace — so your ideas move with intention.</p>
                        </div>
                        <div class="grid grid-cols-1 gap-6 md:grid-cols-3">
                            <div class="group relative overflow-hidden rounded-3xl border border-border/50 bg-background/50 p-8 backdrop-blur-sm transition-all hover:shadow-2xl hover:shadow-violet-500/10 sm:p-10 md:col-span-2"><h3 class="mb-3 text-3xl font-bold tracking-tight">Text to Image</h3><p class="text-lg leading-relaxed text-muted-foreground">Generate stunning visuals from words. Integrated with FLUX, Stable Diffusion, and premium models.</p></div>
                            <div class="rounded-3xl border border-border/50 bg-background/50 p-8 backdrop-blur-sm transition-all hover:shadow-2xl hover:shadow-blue-500/10 sm:p-10"><h3 class="mb-3 text-2xl font-bold tracking-tight">Image to Video</h3><p class="leading-relaxed text-muted-foreground">Bring your static images to life with cinematic motion and depth.</p></div>
                            <div class="rounded-3xl border border-border/50 bg-background/50 p-8 backdrop-blur-sm transition-all hover:shadow-2xl hover:shadow-emerald-500/10 sm:p-10"><h3 class="mb-3 text-2xl font-bold tracking-tight">Text to Speech</h3><p class="leading-relaxed text-muted-foreground">Natural voiceovers that sound human in multiple languages.</p></div>
                            <div class="rounded-3xl border border-border/50 bg-background/50 p-8 backdrop-blur-sm transition-all hover:shadow-2xl hover:shadow-amber-500/10 sm:p-10 md:col-span-2"><h3 class="mb-3 text-3xl font-bold tracking-tight">Text to Music</h3><p class="text-lg leading-relaxed text-muted-foreground">Create soundtracks instantly. Build the perfect mood with Stable Audio and MusicGen.</p></div>
                        </div>
                    </div>
                </section>

                <section class="relative overflow-hidden bg-foreground py-32 text-background sm:py-40">
                    <div class="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
                        <h2 class="mb-16 max-w-4xl text-4xl font-black leading-[1.05] tracking-tight md:text-6xl lg:text-7xl">"After 10 years building software, I realized something. <span class="text-background/40">The best ideas often die because they can't be shown, only told.</span>"</h2>
                        <div class="mt-16 grid gap-8 border-t border-background/20 pt-12 md:grid-cols-4">
                            <div><p class="font-bold text-lg leading-tight">Samuel</p><p class="text-sm text-background/60">Founder & Developer</p></div>
                            <div class="max-w-3xl space-y-6 text-lg leading-relaxed text-background/70 md:col-span-3 md:text-xl"><p>The hardest part isn't writing code. It's <strong class="font-semibold text-background">communicating motion</strong>. A still frame can sell a look, but timing, rhythm, and change are what make people feel it.</p><p>I built this editor for people with ideas worth showing — people who want speed without giving up creative control.</p></div>
                        </div>
                    </div>
                </section>

                <section class="relative overflow-hidden border-t border-border/40 py-24 sm:py-32">
                    <div class="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
                        <h2 class="mb-6 text-4xl font-extrabold tracking-tight md:text-6xl">Make the next frame matter.</h2>
                        <p class="mx-auto mb-10 max-w-xl text-xl text-muted-foreground">Turn prompts and assets into videos that feel directed, not randomly generated.</p>
                        @auth
                            <a href="{{ route('editor.index') }}" class="inline-flex h-14 items-center justify-center rounded-full bg-primary px-10 text-lg font-medium text-primary-foreground shadow-xl shadow-primary/20">My Projects</a>
                        @else
                            @if ($canRegister)
                                <a href="{{ route('register') }}" class="inline-flex h-14 items-center justify-center rounded-full bg-primary px-10 text-lg font-medium text-primary-foreground shadow-xl shadow-primary/20">Get Started Free</a>
                            @endif
                        @endauth
                    </div>
                </section>
            </main>

            <footer class="relative z-10 border-t border-border/40 bg-background py-12 sm:py-16">
                <div class="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[1.3fr_2fr] lg:px-8">
                    <div class="flex flex-col gap-4"><div class="flex items-center gap-2"><div class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary"><svg class="h-4 w-4 text-primary-foreground ml-0.5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="6 3 20 12 6 21 6 3" /></svg></div><span class="font-semibold tracking-tight">usekeyframes.com</span></div><p class="max-w-sm text-sm leading-6 text-muted-foreground">AI-native video creation with keyframe-level control for product videos, social content, demos, and campaign assets.</p><p class="text-sm text-muted-foreground">&copy; {{ now()->year }} usekeyframes.com. All rights reserved.</p></div>
                    <div class="grid gap-8 sm:grid-cols-3"><div><h2 class="text-sm font-semibold tracking-wide">Product</h2><ul class="mt-4 flex flex-col gap-3 text-sm text-muted-foreground"><li><a class="transition-colors hover:text-foreground" href="{{ route('editor.index') }}">Editor</a></li><li><a class="transition-colors hover:text-foreground" href="{{ route('seo.pages.show', 'ai-video-editor') }}">AI Video Editor</a></li></ul></div><div><h2 class="text-sm font-semibold tracking-wide">Resources</h2><ul class="mt-4 flex flex-col gap-3 text-sm text-muted-foreground"><li><a class="transition-colors hover:text-foreground" href="{{ route('seo.blog.index') }}">Blog</a></li><li><a class="transition-colors hover:text-foreground" href="{{ route('seo.blog.show', 'how-to-make-product-videos-faster') }}">Product video workflow</a></li></ul></div><div><h2 class="text-sm font-semibold tracking-wide">Account</h2><ul class="mt-4 flex flex-col gap-3 text-sm text-muted-foreground"><li><a class="transition-colors hover:text-foreground" href="{{ route('login') }}">Sign in</a></li>@if ($canRegister)<li><a class="transition-colors hover:text-foreground" href="{{ route('register') }}">Create account</a></li>@endif</ul></div></div>
                </div>
            </footer>
        </div>
    </body>
</html>
