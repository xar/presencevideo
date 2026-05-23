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

it('shows user messages before assistant messages when timestamps match', function () {
    $user = User::factory()->create();
    $conversation = Conversation::create([
        'id' => (string) Str::uuid(),
        'user_id' => $user->id,
        'title' => 'Ordering test',
    ]);
    $timestamp = now();

    ConversationMessage::create([
        'id' => (string) Str::uuid(),
        'conversation_id' => $conversation->id,
        'user_id' => $user->id,
        'agent' => GenericAgent::class,
        'role' => 'assistant',
        'content' => 'Answer',
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
        'created_at' => $timestamp,
        'updated_at' => $timestamp,
    ]);

    ConversationMessage::create([
        'id' => (string) Str::uuid(),
        'conversation_id' => $conversation->id,
        'user_id' => $user->id,
        'agent' => GenericAgent::class,
        'role' => 'user',
        'content' => 'Question',
        'attachments' => [],
        'tool_calls' => [],
        'tool_results' => [],
        'usage' => [],
        'meta' => [],
        'created_at' => $timestamp,
        'updated_at' => $timestamp,
    ]);

    $this->actingAs($user)
        ->get(route('agent.chat.show', $conversation))
        ->assertInertia(fn ($page) => $page
            ->where('messages.0.content', 'Question')
            ->where('messages.1.content', 'Answer'));
});

it('starts a new remembered conversation with the generic agent in the background', function () {
    GenericAgent::fake(['Hello from the agent.']);

    $user = User::factory()->create();

    $this->actingAs($user)
        ->post(route('agent.chat.store'), [
            'message' => 'Help me plan a video',
        ])
        ->assertRedirect()
        ->assertSessionHas('pending_agent_message', 'Help me plan a video');

    GenericAgent::assertQueued('Help me plan a video');

    $conversation = $user->conversations()->first();

    expect($conversation)->not->toBeNull()
        ->and($conversation->title)->toBe('Help me plan a video')
        ->and($conversation->messages()->exists())->toBeFalse();
});

it('starts a broadcasted conversation with the generic agent', function () {
    GenericAgent::fake(['Broadcasted hello.']);

    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->postJson(route('agent.chat.prepare'), [
            'message' => 'Broadcast this please',
        ])
        ->assertSuccessful()
        ->assertJsonStructure(['conversation_id', 'channel']);

    $conversationId = $response->json('conversation_id');

    $this->actingAs($user)
        ->postJson(route('agent.chat.broadcast'), [
            'message' => 'Broadcast this please',
            'conversation_id' => $conversationId,
        ])
        ->assertSuccessful();

    GenericAgent::assertQueued('Broadcast this please');

    expect($user->conversations()->whereKey($conversationId)->exists())->toBeTrue()
        ->and($response->json('channel'))->toBe("agent.chat.{$user->id}.{$conversationId}");
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
