<?php

namespace App\Http\Controllers\Agent;

use App\Ai\Agents\GenericAgent;
use App\Http\Controllers\Controller;
use App\Http\Requests\Agent\SendMessageRequest;
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
            ->get(['id', 'role', 'content', 'tool_calls', 'tool_results', 'created_at'])
            ->values() ?? collect();

        return Inertia::render('agent/Chat', [
            'conversations' => $conversations,
            'conversation' => $conversation?->only(['id', 'title', 'created_at', 'updated_at']),
            'messages' => $messages,
        ]);
    }

    public function store(SendMessageRequest $request): RedirectResponse
    {
        $message = $request->validated('message');
        $response = $this->agentForRequest($request)->prompt($message);

        $this->updateConversationTitle($request, $response->conversationId, $message);

        return to_route('agent.chat.show', $response->conversationId);
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

    protected function updateConversationTitle(SendMessageRequest $request, ?string $conversationId, string $message): void
    {
        if ($conversationId === null) {
            return;
        }

        $request->user()
            ->conversations()
            ->whereKey($conversationId)
            ->update(['title' => Str::limit($message, 60)]);
    }
}
