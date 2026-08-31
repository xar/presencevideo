<?php

test('homepage renders as blade with the async editor demo island', function () {
    $response = $this->get(route('home'));

    $response->assertOk()
        ->assertSee('AI video,', false)
        ->assertSee('id="demo-editor"', false)
        ->assertDontSee('data-page=', false);

    // The island script is referenced by its source path when the Vite dev
    // server is running, or by a hashed build asset in production
    expect($response->getContent())->toMatch('/demo-editor[^"\']*\.(ts|js)/');
});
