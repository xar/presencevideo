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
    <body class="bg-white text-zinc-950 antialiased">
        <header class="border-b border-zinc-200">
            <nav class="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
                <a href="{{ route('home') }}" class="font-semibold">{{ config('seo.site.name') }}</a>
                <div class="flex gap-5 text-sm text-zinc-600">
                    <a href="{{ route('seo.blog.index') }}" class="hover:text-zinc-950">Blog</a>
                    <a href="{{ route('seo.pages.show', 'ai-video-editor') }}" class="hover:text-zinc-950">AI video editor</a>
                </div>
            </nav>
        </header>

        <main>
            @yield('content')
        </main>
    </body>
</html>
