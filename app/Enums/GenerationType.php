<?php

namespace App\Enums;

enum GenerationType: string
{
    case TextToImage = 'text_to_image';
    case ImageToVideo = 'image_to_video';
    case TextToMusic = 'text_to_music';
    case TextToSpeech = 'text_to_speech';
    case TextToSfx = 'text_to_sfx';
}
