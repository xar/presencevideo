<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>{{ $meta['title'] }}</title>
        <meta name="description" content="{{ $meta['description'] }}">
        <link rel="canonical" href="{{ $meta['canonical'] }}">

        <meta property="og:type" content="{{ $meta['type'] ?? 'website' }}">
        <meta property="og:site_name" content="{{ config('seo.site.name') }}">
        <meta property="og:title" content="{{ $meta['title'] }}">
        <meta property="og:description" content="{{ $meta['description'] }}">
        <meta property="og:url" content="{{ $meta['canonical'] }}">
        <meta property="og:image" content="{{ url($meta['image'] ?? config('seo.site.image')) }}">

        <meta name="twitter:card" content="summary_large_image">
        <meta name="twitter:title" content="{{ $meta['title'] }}">
        <meta name="twitter:description" content="{{ $meta['description'] }}">
        <meta name="twitter:image" content="{{ url($meta['image'] ?? config('seo.site.image')) }}">

        <link rel="icon" href="/favicon.ico" sizes="any">
        <link rel="icon" href="/favicon.svg" type="image/svg+xml">
        <link rel="apple-touch-icon" href="/apple-touch-icon.png">
        @vite(['resources/css/app.css'])
        @stack('structured-data')
    </head>
    <body class="bg-background text-foreground antialiased selection:bg-primary/20">
        <div class="fixed top-6 inset-x-0 z-50 flex justify-center px-4 pointer-events-none">
            <header class="pointer-events-auto flex w-full max-w-4xl items-center justify-between rounded-full border border-white/10 bg-background/60 px-4 py-3 backdrop-blur-2xl shadow-[0_8px_32px_rgba(0,0,0,0.08)] transition-all duration-300">
                <a href="{{ route('home') }}" class="flex items-center gap-2 group pl-2">
                    <div class="flex h-8 w-8 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 transition-transform group-hover:scale-105">
                        <svg class="h-4 w-4 text-primary-foreground ml-0.5" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <polygon points="6 3 20 12 6 21 6 3"></polygon>
                        </svg>
                    </div>
                    <span class="text-xl font-bold tracking-tight">usekeyframes.com</span>
                </a>

                <nav class="flex items-center gap-2 sm:gap-4">
                    @auth
                        <a href="{{ route('editor.index') }}" class="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 group">
                            My Projects
                            <svg class="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M5 12h14"></path>
                                <path d="m12 5 7 7-7 7"></path>
                            </svg>
                        </a>
                    @else
                        <a href="{{ route('login') }}" class="hidden h-9 items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground sm:inline-flex">
                            Sign In
                        </a>
                        @if (\Laravel\Fortify\Features::enabled(\Laravel\Fortify\Features::registration()))
                            <a href="{{ route('register') }}" class="inline-flex h-9 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90 group">
                                Get Started
                                <svg class="h-4 w-4 ml-1 transition-transform group-hover:translate-x-1" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                    <path d="M5 12h14"></path>
                                    <path d="m12 5 7 7-7 7"></path>
                                </svg>
                            </a>
                        @endif
                    @endauth
                </nav>
            </header>
        </div>

        <main class="pt-24">
            @yield('content')
        </main>
    </body>
</html>
