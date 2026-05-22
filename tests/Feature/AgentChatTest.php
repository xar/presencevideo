<?php

use App\Ai\Agents\GenericAgent;
use App\Models\User;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;
use Laravel\Ai\Models\ConversationMessage;

it('shows the agent chat page with previous conversations', function () {
    $user = User::factory()->create();
    $conversation = Conversation::create([
        'id' => (string) Str::uuid(),
        'user_id' => $user->id,
        'title' => 'Storyboard ideas',
    ]);

    ConversationMessage::create([
        'id' => (string) Str::uuid(),
        'conversation_id' => $conversation->id,
        'user_id' => $user->id,
        'agent' => GenericAgent::class,
        'role' => 'user',
        'content' => 'Hello',
        'attachments' => [],
        'tool_calls' => [
            ['tool_id' => 'tool-1', 'tool_name' => 'ComposeVideoProject', 'arguments' => ['title' => 'Demo']],
        ],
        'tool_results' => [
            ['tool_id' => 'tool-1', 'tool_name' => 'ComposeVideoProject', 'result' => ['project_id' => 123], 'successful' => true],
        ],
        'usage' => [],
        'meta' => [],
    ]);

    $this->actingAs($user)
        ->get(route('agent.chat.show', $conversation))
        ->assertSuccessful()
        ->assertInertia(fn ($page) => $page
            ->component('agent/Chat')
            ->has('conversations', 1)
            ->where('conversation.id', $conversation->id)
            ->where('messages.0.content', 'Hello')
            ->where('messages.0.tool_calls.0.tool_name', 'ComposeVideoProject')
            ->where('messages.0.tool_results.0.result.project_id', 123));
});

it('starts a new remembered conversation with the generic agent', function () {
    GenericAgent::fake(['Hello from the agent.']);

    $user = User::factory()->create();

    $this->actingAs($user)
        ->post(route('agent.chat.store'), [
            'message' => 'Help me plan a video',
        ])
        ->assertRedirect();

    GenericAgent::assertPrompted('Help me plan a video');

    $conversation = $user->conversations()->first();

    expect($conversation)->not->toBeNull()
        ->and($conversation->title)->toBe('Help me plan a video')
        ->and($conversation->messages()->where('role', 'user')->where('content', 'Help me plan a video')->exists())->toBeTrue()
        ->and($conversation->messages()->where('role', 'assistant')->exists())->toBeTrue();
});

it('streams a new remembered conversation with the generic agent', function () {
    GenericAgent::fake(['Streamed hello.']);

    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->post(route('agent.chat.stream'), [
            'message' => 'Stream this please',
        ])
        ->assertSuccessful();

    expect($response->streamedContent())
        ->toContain('data:')
        ->toContain('[DONE]');

    GenericAgent::assertPrompted('Stream this please');

    expect($user->conversations()->where('title', 'Stream this please')->exists())->toBeTrue();
});

it('prevents continuing another users conversation', function () {
    GenericAgent::fake()->preventStrayPrompts();

    $owner = User::factory()->create();
    $otherUser = User::factory()->create();
    $conversation = Conversation::create([
        'id' => (string) Str::uuid(),
        'user_id' => $owner->id,
        'title' => 'Private chat',
    ]);

    $this->actingAs($otherUser)
        ->post(route('agent.chat.store'), [
            'message' => 'Can I join?',
            'conversation_id' => $conversation->id,
        ])
        ->assertNotFound();
});
