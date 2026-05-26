<?php

namespace App\Http\Controllers\Seo;

use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Response;

class BlogController extends Controller
{
    public function index(): View
    {
        $meta = [
            'title' => 'Blog | '.config('seo.site.name'),
            'description' => 'Guides and resources for creating better videos faster with AI-assisted editing workflows.',
            'canonical' => route('seo.blog.index'),
        ];

        return view('blog.index', [
            'meta' => $meta,
            'posts' => config('seo.blog_posts'),
        ]);
    }

    public function show(string $slug): View
    {
        $post = config("seo.blog_posts.{$slug}");

        abort_if($post === null, Response::HTTP_NOT_FOUND);

        $meta = [
            'title' => $post['title'].' | '.config('seo.site.name'),
            'description' => $post['description'],
            'canonical' => route('seo.blog.show', $slug),
            'type' => 'article',
        ];

        return view('blog.show', [
            'meta' => $meta,
            'post' => $post,
            'structuredData' => [
                '@context' => 'https://schema.org',
                '@type' => 'BlogPosting',
                'headline' => $post['title'],
                'description' => $post['description'],
                'datePublished' => $post['published_at'],
                'author' => [
                    '@type' => 'Organization',
                    'name' => $post['author'],
                ],
                'mainEntityOfPage' => route('seo.blog.show', $slug),
            ],
        ]);
    }
}
