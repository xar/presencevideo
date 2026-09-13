<?php

use App\Ai\Agents\GenericAgent;
use App\Enums\AgentInvocationStatus;
use App\Jobs\RunAgentInvocation;
use App\Models\AgentInvocation;
use App\Models\User;
use App\Support\QuietBroadcast;
use Illuminate\Support\Str;
use Laravel\Ai\Models\Conversation;

function makeInvocation(User $user, array $attributes = []): AgentInvocation
{
    $conversation = Conversation::create([
        'id' => (string) Str::uuid(),
        'user_id' => $user->id,
        'title' => 'Durability',
    ]);

    return AgentInvocation::create(array_merge([
        'id' => (string) Str::uuid(),
        'conversation_id' => $conversation->id,
        'user_id' => $user->id,
        'status' => AgentInvocationStatus::Queued,
        'prompt' => 'Make me a video',
        'partial_text' => '',
        'heartbeat_at' => now(),
    ], $attributes));
}

it('persists streamed text so a client that heard nothing can still recover it', function () {
    GenericAgent::fake(['Here is your plan.']);

    $invocation = makeInvocation(User::factory()->create());

    (new RunAgentInvocation($invocation->id))->handle();

    $invocation->refresh();

    expect($invocation->status)->toBe(AgentInvocationStatus::Completed)
        ->and($invocation->partial_text)->toContain('Here is your plan.')
        ->and($invocation->finished_at)->not->toBeNull();
});

it('marks the invocation failed when the run blows up', function () {
    $invocation = makeInvocation(User::factory()->create(), [
        'status' => AgentInvocationStatus::Running,
    ]);

    (new RunAgentInvocation($invocation->id))->failed(new RuntimeException('provider exploded'));

    $invocation->refresh();

    // The client is waiting on this row; it must reach a terminal state or the
    // chat UI would spin forever.
    expect($invocation->status)->toBe(AgentInvocationStatus::Failed)
        ->and($invocation->error_message)->not->toBeNull();
});

it('does not restart an invocation that already finished', function () {
    GenericAgent::fake()->preventStrayPrompts();

    $invocation = makeInvocation(User::factory()->create(), [
        'status' => AgentInvocationStatus::Completed,
        'partial_text' => 'Already done.',
    ]);

    (new RunAgentInvocation($invocation->id))->handle();

    expect($invocation->refresh()->partial_text)->toBe('Already done.');
});

it('sweeps invocations whose worker stopped heartbeating', function () {
    $user = User::factory()->create();

    $stale = makeInvocation($user, [
        'status' => AgentInvocationStatus::Running,
        'heartbeat_at' => now()->subSeconds(config('agent.stream.stale_after_seconds') + 60),
    ]);

    $live = makeInvocation($user, [
        'status' => AgentInvocationStatus::Running,
        'heartbeat_at' => now(),
    ]);

    $this->artisan('agent:sweep-invocations')->assertSuccessful();

    // A SIGKILLed worker never runs failed(), so this is the only thing that
    // unsticks the client.
    expect($stale->refresh()->status)->toBe(AgentInvocationStatus::Failed)
        ->and($live->refresh()->status)->toBe(AgentInvocationStatus::Running);
});

it('leaves finished invocations alone when sweeping', function () {
    $invocation = makeInvocation(User::factory()->create(), [
        'status' => AgentInvocationStatus::Completed,
        'heartbeat_at' => now()->subDay(),
    ]);

    $this->artisan('agent:sweep-invocations')->assertSuccessful();

    expect($invocation->refresh()->status)->toBe(AgentInvocationStatus::Completed);
});

it('does not let a broadcaster outage take the run down with it', function () {
    $result = QuietBroadcast::attempt(
        fn () => throw new RuntimeException('reverb is down'),
        'test',
    );

    expect($result)->toBeFalse();
});

it('keeps the broker visibility timeout above the agent job timeout', function () {
    $jobTimeout = (new RunAgentInvocation('missing'))->timeout;

    // Laravel requires retry_after > timeout; otherwise the broker hands a live
    // agent run to a second worker, duplicating its billable tool calls.
    foreach (['redis', 'database', 'beanstalkd'] as $connection) {
        expect(config("queue.connections.{$connection}.retry_after"))
            ->toBeGreaterThan($jobTimeout, "{$connection} retry_after must exceed the job timeout");
    }

    // The job's own timeout must fire before the worker SIGKILLs it, so that
    // failed() gets the chance to mark the invocation.
    $env = file_get_contents(base_path('.env.docker.example'));
    preg_match('/^QUEUE_TIMEOUT=(\d+)$/m', $env, $workerTimeout);

    expect($jobTimeout)->toBeLessThan((int) $workerTimeout[1]);
});

it('never retries an agent run', function () {
    // Replaying a partially completed run would duplicate fal.ai generations
    // and renders, so recovery is by sweeping, never by retrying.
    expect((new RunAgentInvocation('missing'))->tries)->toBe(1);
});
