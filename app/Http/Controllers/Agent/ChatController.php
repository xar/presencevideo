<?php

namespace App\Http\Controllers\Agent;

use App\Ai\Agents\GenericAgent;
use App\Enums\AgentInvocationStatus;
use App\Http\Controllers\Controller;
use App\Http\Requests\Agent\SendMessageRequest;
use App\Jobs\RunAgentInvocation;
use App\Models\AgentActivity;
use App\Models\AgentInvocation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;
use Laravel\Ai\Models\Conversation;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ChatController extends Controller
{
    public function index(Request $request, ?Conversation $conversation = null): Response
    {
        if ($conversation !== null && $conversation->user_id !== $request->user()->id) {
            abort(404);
        }

        $conversations = $request->user()
            ->conversations()
            ->latest('updated_at')
            ->get(['id', 'title', 'updated_at', 'created_at']);

        $messages = $this->messages($conversation);

        return Inertia::render('agent/Chat', [
            'conversations' => $conversations,
            'conversation' => $conversation?->only(['id', 'title', 'created_at', 'updated_at']),
            'broadcastChannel' => $conversation === null
                ? null
                : $this->broadcastChannelName($request->user()->id, $conversation->id),
            'messages' => $messages,
            'activities' => $this->activities($request, $conversation),
            'invocation' => $this->activeInvocation($request->user()->id, $conversation?->id)?->toClientState(),
            'watchdogSeconds' => (int) config('agent.stream.client_watchdog_seconds', 20),
            'pendingMessage' => session('pending_agent_message'),
        ]);
    }

    /**
     * Start an agent run and return everything the client needs to follow it.
     *
     * This is deliberately a single round trip. Splitting conversation creation
     * from dispatch meant the client had to subscribe in the gap between two
     * requests, and anything the agent emitted before that subscription landed
     * was lost with no way to recover it. The invocation row now exists before
     * the job is dispatched, so a client can join — or rejoin — at any point
     * and read back everything it missed.
     */
    public function send(SendMessageRequest $request): JsonResponse
    {
        $message = $request->validated('message');
        $idempotencyKey = $request->validated('idempotency_key');
        $userId = $request->user()->id;

        if ($idempotencyKey !== null) {
            $existing = AgentInvocation::query()
                ->where('user_id', $userId)
                ->where('idempotency_key', $idempotencyKey)
                ->first();

            if ($existing !== null) {
                return response()->json($this->sendPayload($existing));
            }
        }

        $conversationId = $request->validated('conversation_id') ?? $this->createConversation($request, $message);

        $this->authorizeConversation($request, $conversationId);
        $this->updateConversationTitleForUser($userId, $conversationId, $message);

        $invocation = AgentInvocation::create([
            'id' => (string) Str::uuid(),
            'conversation_id' => $conversationId,
            'user_id' => $userId,
            'status' => AgentInvocationStatus::Queued,
            'prompt' => $message,
            'partial_text' => '',
            'idempotency_key' => $idempotencyKey,
            'heartbeat_at' => now(),
        ]);

        RunAgentInvocation::dispatch($invocation->id);

        return response()->json($this->sendPayload($invocation));
    }

    /**
     * Return the authoritative state of a conversation.
     *
     * The client calls this whenever it may have missed events — on reconnect,
     * on tab focus, and on a watchdog timeout — and replaces its local state
     * with the result. It is what makes the websocket optional rather than
     * load-bearing.
     */
    public function state(Request $request, Conversation $conversation): JsonResponse
    {
        abort_unless($conversation->user_id === $request->user()->id, 404);

        $invocationId = $request->query('invocation');

        $invocation = is_string($invocationId)
            ? AgentInvocation::query()
                ->whereKey($invocationId)
                ->where('user_id', $request->user()->id)
                ->first()
            : $this->latestInvocation($request->user()->id, $conversation->id);

        return response()->json([
            'invocation' => $invocation?->toClientState(),
            'activities' => $this->activities($request, $conversation),
            'messages' => $this->messages($conversation),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    protected function sendPayload(AgentInvocation $invocation): array
    {
        return [
            'conversation_id' => $invocation->conversation_id,
            'invocation_id' => $invocation->id,
            'channel' => $this->broadcastChannelName($invocation->user_id, $invocation->conversation_id),
            'invocation' => $invocation->toClientState(),
        ];
    }

    /**
     * Get the invocation a freshly rendered page should resume following.
     *
     * Only unfinished runs qualify: a finished one is already represented by the
     * assistant message in the transcript, and handing it to the client as well
     * would render the same reply twice. It doubles as the signal the client
     * uses to retire its live copy once the persisted message arrives.
     */
    protected function activeInvocation(int $userId, ?string $conversationId): ?AgentInvocation
    {
        $invocation = $this->latestInvocation($userId, $conversationId);

        return $invocation?->isTerminal() === false ? $invocation : null;
    }

    /**
     * Get the most recent invocation for a conversation, if any.
     */
    protected function latestInvocation(int $userId, ?string $conversationId): ?AgentInvocation
    {
        if ($conversationId === null) {
            return null;
        }

        return AgentInvocation::query()
            ->where('user_id', $userId)
            ->where('conversation_id', $conversationId)
            ->latest('created_at')
            ->first();
    }

    /**
     * Load a conversation's messages in the order the UI renders them.
     *
     * @return Collection<int, \Laravel\Ai\Models\ConversationMessage>
     */
    protected function messages(?Conversation $conversation): Collection
    {
        return $conversation?->messages()
            ->orderBy('created_at')
            ->orderByRaw("case when role = 'user' then 0 else 1 end")
            ->orderBy('id')
            ->get(['id', 'role', 'content', 'tool_calls', 'tool_results', 'created_at'])
            ->values() ?? collect();
    }

    protected function activities(Request $request, ?Conversation $conversation): array
    {
        if ($conversation === null) {
            return [];
        }

        return AgentActivity::query()
            ->where('conversation_id', $conversation->id)
            ->where('user_id', $request->user()->id)
            ->latest('updated_at')
            ->limit(20)
            ->get(['id', 'name', 'status', 'payload', 'created_at', 'updated_at'])
            ->map(fn ($activity) => [
                'id' => (string) $activity->id,
                'name' => $activity->name,
                'status' => $activity->status,
                'result' => $activity->payload,
                'successful' => $activity->status !== 'failed',
                'error' => $activity->payload['error_message'] ?? null,
                'timestamp' => $activity->created_at?->timestamp,
            ])
            ->values()
            ->all();
    }

    public function store(SendMessageRequest $request): RedirectResponse
    {
        $message = $request->validated('message');
        $conversationId = $request->validated('conversation_id') ?? $this->createConversation($request, $message);

        $this->authorizeConversation($request, $conversationId);

        $agent = (new GenericAgent)->continue($conversationId, as: $request->user());
        $agent->queue($message);

        $this->updateConversationTitle($request, $conversationId, $message);

        return to_route('agent.chat.show', $conversationId)
            ->with('pending_agent_message', $message);
    }

    public function stream(SendMessageRequest $request): StreamedResponse
    {
        $message = $request->validated('message');
        $stream = $this->agentForRequest($request)
            ->stream($message)
            ->then(function ($response) use ($request, $message): void {
                $this->updateConversationTitle($request, $response->conversationId, $message);
            });

        return response()->stream(function () use ($stream): void {
            foreach ($stream as $event) {
                echo 'data: '.((string) $event)."\n\n";
                flush();
            }

            echo 'data: '.json_encode([
                'type' => 'conversation',
                'conversation_id' => $stream->conversationId,
            ])."\n\n";
            echo "data: [DONE]\n\n";
            flush();
        }, headers: [
            'Content-Type' => 'text/event-stream',
            'Cache-Control' => 'no-cache',
            'X-Accel-Buffering' => 'no',
        ]);
    }

    public function latest(Request $request): JsonResponse
    {
        $conversation = $request->user()
            ->conversations()
            ->latest('updated_at')
            ->first(['id', 'title', 'created_at', 'updated_at']);

        return response()->json([
            'conversation' => $conversation,
        ]);
    }

    protected function agentForRequest(SendMessageRequest $request): GenericAgent
    {
        $user = $request->user();
        $conversationId = $request->validated('conversation_id');

        if ($conversationId !== null) {
            $belongsToUser = $user->conversations()
                ->whereKey($conversationId)
                ->exists();

            abort_unless($belongsToUser, 404);
        }

        return $conversationId === null
            ? (new GenericAgent)->forUser($user)
            : (new GenericAgent)->continue($conversationId, as: $user);
    }

    protected function authorizeConversation(SendMessageRequest $request, string $conversationId): void
    {
        $belongsToUser = $request->user()
            ->conversations()
            ->whereKey($conversationId)
            ->exists();

        abort_unless($belongsToUser, 404);
    }

    protected function createConversation(SendMessageRequest $request, string $message): string
    {
        $conversation = Conversation::create([
            'id' => (string) Str::uuid(),
            'user_id' => $request->user()->id,
            'title' => Str::limit($message, 60),
        ]);

        return $conversation->id;
    }

    protected function broadcastChannelName(int $userId, string $conversationId): string
    {
        return "agent.chat.{$userId}.{$conversationId}";
    }

    protected function updateConversationTitle(SendMessageRequest $request, ?string $conversationId, string $message): void
    {
        $this->updateConversationTitleForUser($request->user()->id, $conversationId, $message);
    }

    protected function updateConversationTitleForUser(int $userId, ?string $conversationId, string $message): void
    {
        if ($conversationId === null) {
            return;
        }

        Conversation::query()
            ->whereKey($conversationId)
            ->where('user_id', $userId)
            ->update(['title' => Str::limit($message, 60)]);
    }
}
