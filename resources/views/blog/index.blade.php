@extends('layouts.seo')

@section('content')
    <section class="mx-auto max-w-5xl px-6 py-16">
        <p class="mb-4 text-sm font-semibold uppercase tracking-wide text-indigo-600">Supporting content</p>
        <h1 class="text-4xl font-bold tracking-tight sm:text-5xl">Video editing guides and growth resources</h1>
        <p class="mt-5 max-w-2xl text-lg leading-8 text-zinc-600">Practical articles for creating better videos, faster.</p>

        <div class="mt-12 grid gap-6">
            @foreach ($posts as $slug => $post)
                <article class="rounded-2xl border border-zinc-200 p-6 shadow-sm">
                    <p class="text-sm text-zinc-500">{{ \Illuminate\Support\Carbon::parse($post['published_at'])->toFormattedDateString() }}</p>
                    <h2 class="mt-2 text-2xl font-semibold">
                        <a href="{{ route('seo.blog.show', $slug) }}" class="hover:text-indigo-600">{{ $post['title'] }}</a>
                    </h2>
                    <p class="mt-3 text-zinc-600">{{ $post['excerpt'] }}</p>
                </article>
            @endforeach
        </div>
    </section>
@endsection
