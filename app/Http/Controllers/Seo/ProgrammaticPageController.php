<?php

namespace App\Http\Controllers\Seo;

use App\Http\Controllers\Controller;
use Illuminate\Contracts\View\View;
use Illuminate\Http\Response;

class ProgrammaticPageController extends Controller
{
    public function show(string $slug): View
    {
        $page = config("seo.programmatic_pages.{$slug}");

        abort_if($page === null, Response::HTTP_NOT_FOUND);

        $meta = [
            'title' => $page['title'].' | '.config('seo.site.name'),
            'description' => $page['description'],
            'canonical' => route('seo.pages.show', $slug),
        ];

        return view('seo.page', [
            'meta' => $meta,
            'page' => $page,
            'structuredData' => [
                '@context' => 'https://schema.org',
                '@type' => 'WebPage',
                'name' => $page['title'],
                'description' => $page['description'],
                'url' => route('seo.pages.show', $slug),
            ],
        ]);
    }
}
