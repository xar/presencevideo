<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('App.Models.User.{id}', function ($user, $id) {
    return (int) $user->id === (int) $id;
});

Broadcast::channel('agent.chat.{userId}.{conversationId}', function ($user, int $userId, string $conversationId) {
    return (int) $user->id === $userId
        && $user->conversations()->whereKey($conversationId)->exists();
});
