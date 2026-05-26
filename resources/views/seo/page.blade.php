@extends('layouts.seo')

@push('structured-data')
    <script type="application/ld+json">
        {!! json_encode($structuredData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
    </script>
@endpush

@section('content')
    <article class="mx-auto max-w-5xl px-6 py-16">
        <p class="mb-4 text-sm font-semibold uppercase tracking-wide text-indigo-600">{{ $page['eyebrow'] }}</p>
        <h1 class="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">{{ $page['headline'] }}</h1>
        <p class="mt-6 max-w-2xl text-lg leading-8 text-zinc-600">{{ $page['intro'] }}</p>

        <section class="mt-12 grid gap-4 sm:grid-cols-3">
            @foreach ($page['features'] as $feature)
                <div class="rounded-2xl border border-zinc-200 p-6 shadow-sm">
                    <p class="text-base leading-7 text-zinc-700">{{ $feature }}</p>
                </div>
            @endforeach
        </section>
    </article>
@endsection
