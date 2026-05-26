<?php

test('blog index renders server side meta tags', function () {
    $response = $this->get(route('seo.blog.index'));

    $response->assertOk()
        ->assertSee('<title>Blog | usekeyframes.com</title>', false)
        ->assertSee('<meta name="description" content="Guides and resources for creating better videos faster with AI-assisted editing workflows.">', false)
        ->assertSee('<link rel="canonical" href="'.route('seo.blog.index').'">', false)
        ->assertSee('Video editing guides and growth resources');
});

test('blog post renders article structured data', function () {
    $response = $this->get(route('seo.blog.show', 'how-to-make-product-videos-faster'));

    $response->assertOk()
        ->assertSee('How to Make Product Videos Faster')
        ->assertSee('application/ld+json')
        ->assertSee('BlogPosting')
        ->assertSee('<meta property="og:type" content="article">', false);
});

test('programmatic seo page renders with canonical metadata', function () {
    $response = $this->get(route('seo.pages.show', 'ai-video-editor'));

    $response->assertOk()
        ->assertSee('Create polished videos faster with an AI video editor')
        ->assertSee('<link rel="canonical" href="'.route('seo.pages.show', 'ai-video-editor').'">', false)
        ->assertSee('WebPage');
});

test('unknown seo content returns not found', function () {
    $this->get('/blog/missing-post')->assertNotFound();
    $this->get('/use-cases/missing-page')->assertNotFound();
});
