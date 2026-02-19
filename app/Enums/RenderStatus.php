<?php

namespace App\Enums;

enum RenderStatus: string
{
    case Queued = 'queued';
    case Processing = 'processing';
    case Compositing = 'compositing';
    case Mixing = 'mixing';
    case Completed = 'completed';
    case Failed = 'failed';
}
