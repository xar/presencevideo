<?php

namespace App\Jobs;

use App\Ai\Agents\GenericAgent;
use App\Models\User;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ContinueAgentConversation implements ShouldQueue
{
    use Queueable;

    public int $tries = 2;

    public int $timeout = 300;

    public function __construct(
        public string $conversationId,
        public int $userId,
        public string $message,
    ) {}

    public function handle(): void
    {
        $user = User::find($this->userId);

        if ($user === null) {
            return;
        }

        (new GenericAgent)
            ->continue($this->conversationId, as: $user)
            ->queue($this->message);
    }
}
