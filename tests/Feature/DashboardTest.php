<?php

use App\Models\User;

test('guests are redirected to the login page', function () {
    $response = $this->get(route('editor.index'));
    $response->assertRedirect(route('login'));
});

test('authenticated users can visit the projects page', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->get(route('editor.index'));
    $response->assertOk();
});

test('dashboard redirects to editor', function () {
    $user = User::factory()->create();
    $this->actingAs($user);

    $response = $this->get(route('dashboard'));
    $response->assertRedirect('/editor');
});
