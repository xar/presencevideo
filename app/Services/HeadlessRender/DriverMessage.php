<?php

namespace App\Services\HeadlessRender;

/**
 * One NDJSON line emitted by the Node driver on stdout.
 *
 * The driver and PHP talk over a line protocol rather than an exit code so a
 * render's progress is visible while it runs. Parsing is total: a line that is
 * not valid JSON, or carries an unknown type, becomes null and is logged
 * rather than aborting a render that is otherwise going fine. Chrome and
 * Puppeteer both write unstructured noise to stdout on occasion.
 */
class DriverMessage
{
    /**
     * @param  array<string, mixed>  $data
     */
    private function __construct(
        public readonly string $type,
        public readonly array $data,
    ) {}

    /**
     * Message types the driver is allowed to send.
     *
     * @var list<string>
     */
    public const TYPES = ['progress', 'log', 'done', 'error'];

    public static function parse(string $line): ?self
    {
        $line = trim($line);

        if ($line === '' || ! str_starts_with($line, '{')) {
            return null;
        }

        $decoded = json_decode($line, true);

        if (! is_array($decoded) || ! isset($decoded['type']) || ! is_string($decoded['type'])) {
            return null;
        }

        if (! in_array($decoded['type'], self::TYPES, true)) {
            return null;
        }

        return new self($decoded['type'], $decoded);
    }

    /**
     * Split a chunk of driver stdout into messages, keeping any trailing
     * partial line for the next chunk.
     *
     * Symfony's Process hands output in arbitrary chunks, so a JSON object can
     * and does arrive split across two callbacks. Treating each chunk as whole
     * lines loses exactly the `done` message that carries the result.
     *
     * @return array{messages: list<self>, remainder: string}
     */
    public static function drain(string $buffer): array
    {
        $lines = explode("\n", $buffer);
        $remainder = array_pop($lines) ?? '';

        $messages = [];

        foreach ($lines as $line) {
            $message = self::parse($line);

            if ($message !== null) {
                $messages[] = $message;
            }
        }

        return ['messages' => $messages, 'remainder' => $remainder];
    }

    /**
     * Progress percentage of the browser export, clamped to 0-100.
     */
    public function percent(): int
    {
        $percent = $this->data['percent'] ?? 0;

        return max(0, min(100, (int) round((float) $percent)));
    }

    public function message(): string
    {
        $message = $this->data['message'] ?? '';

        return is_string($message) ? $message : '';
    }
}
