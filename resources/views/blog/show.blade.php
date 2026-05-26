@extends('layouts.seo')

@push('structured-data')
    <script type="application/ld+json">
        {!! json_encode($structuredData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}
    </script>
@endpush

@section('content')
    <article class="mx-auto max-w-3xl px-6 py-16">
        <p class="text-sm text-zinc-500">{{ \Illuminate\Support\Carbon::parse($post['published_at'])->toFormattedDateString() }} · {{ $post['author'] }}</p>
        <h1 class="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{{ $post['title'] }}</h1>
        <p class="mt-6 text-lg leading-8 text-zinc-600">{{ $post['excerpt'] }}</p>

        <div class="mt-12 space-y-10">
            @foreach ($post['sections'] as $section)
                <section>
                    <h2 class="text-2xl font-semibold">{{ $section['heading'] }}</h2>
                    <p class="mt-4 leading-8 text-zinc-700">{{ $section['body'] }}</p>
                </section>
            @endforeach
        </div>
    </article>
@endsection
