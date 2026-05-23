<?php

namespace App\Http\Controllers\Agent;

use App\Ai\Agents\GenericAgent;
use App\Http\Controllers\Controller;
use App\Http\Requests\Agent\SendMessageRequest;
use App\Models\AgentActivity;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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

        $messages = $conversation?->messages()
            ->orderBy('created_at')
            ->orderByRaw("case when role = 'user' then 0 else 1 end")
            ->orderBy('id')
            ->get(['id', 'role', 'content', 'tool_calls', 'tool_results', 'created_at'])
            ->values() ?? collect();

        return Inertia::render('agent/Chat', [
            'conversations' => $conversations,
            'conversation' => $conversation?->only(['id', 'title', 'created_at', 'updated_at']),
            'broadcastChannel' => $conversation === null
                ? null
                : $this->broadcastChannelName($request->user()->id, $conversation->id),
            'messages' => $messages,
            'activities' => $this->activities($request, $conversation),
            'pendingMessage' => session('pending_agent_message'),
        ]);
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

    public function prepare(SendMessageRequest $request): JsonResponse
    {
        $message = $request->validated('message');
        $conversationId = $request->validated('conversation_id') ?? $this->createConversation($request, $message);

        $this->authorizeConversation($request, $conversationId);

        return response()->json([
            'conversation_id' => $conversationId,
            'channel' => $this->broadcastChannelName($request->user()->id, $conversationId),
        ]);
    }

    public function broadcast(SendMessageRequest $request): JsonResponse
    {
        $message = $request->validated('message');
        $conversationId = $request->validated('conversation_id');

        abort_unless(is_string($conversationId), 422);

        $this->authorizeConversation($request, $conversationId);

        $userId = $request->user()->id;
        $channel = $this->broadcastChannelName($userId, $conversationId);

        (new GenericAgent)
            ->continue($conversationId, as: $request->user())
            ->broadcastOnQueue(
                $message,
                new PrivateChannel($channel),
            )
            ->then(static function ($response) use ($userId, $message): void {
                if ($response->conversationId === null) {
                    return;
                }

                Conversation::query()
                    ->whereKey($response->conversationId)
                    ->where('user_id', $userId)
                    ->update(['title' => Str::limit($message, 60)]);
            });

        return response()->json([
            'conversation_id' => $conversationId,
            'channel' => $channel,
        ]);
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
