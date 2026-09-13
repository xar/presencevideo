import type { StreamEvent } from './stream-state';

/**
 * Transport wiring for the agent chat stream.
 *
 * Everything here is best-effort by design. The client's job is to deliver
 * events quickly when it can, and to say clearly when it could not — every gap
 * it reports is closed by reconciling against the server's invocation record,
 * so no failure in this file can lose a message.
 */

/** Events the agent pipeline pushes onto a conversation's private channel. */
const STREAM_EVENTS = [
    'text_delta',
    'tool_call',
    'tool_result',
    'activity_updated',
    'invocation_state',
    'stream_end',
    'stream_failed',
    'error',
] as const;

export type StreamClientOptions = {
    /** Called for every event received on the channel. */
    onEvent: (event: StreamEvent) => void;
    /** Called whenever the client may have missed events and should re-sync. */
    onReconcile: (reason: ReconcileReason) => void;
    /** Seconds of silence during a run before a reconcile is forced. */
    watchdogSeconds: number;
};

export type ReconcileReason = 'reconnected' | 'visible' | 'watchdog' | 'subscribe-failed';

export type StreamClient = {
    /**
     * Join a conversation's channel.
     *
     * Resolves true only once the subscription is genuinely established. A
     * false result means events will be missed and the caller should reconcile
     * rather than assume the stream is live.
     */
    subscribe(channel: string): Promise<boolean>;
    /** Arm or disarm the silence watchdog as a run starts and finishes. */
    setStreaming(streaming: boolean): void;
    destroy(): void;
};

/** How long to wait for a subscription before giving up on it. */
const SUBSCRIBE_TIMEOUT_MS = 10_000;

export function createStreamClient(options: StreamClientOptions): StreamClient {
    let activeChannel: string | null = null;
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
    let streaming = false;
    let destroyed = false;

    function echo(): any {
        return (window as any).Echo;
    }

    function clearWatchdog() {
        if (watchdogTimer !== null) {
            clearTimeout(watchdogTimer);
            watchdogTimer = null;
        }
    }

    function armWatchdog() {
        clearWatchdog();

        if (!streaming || destroyed) {
            return;
        }

        watchdogTimer = setTimeout(() => {
            // Silence during a run means either the agent is thinking or we lost
            // the socket. We cannot tell the two apart from here, so ask the
            // server — a reconcile is cheap and always correct.
            options.onReconcile('watchdog');
            armWatchdog();
        }, options.watchdogSeconds * 1000);
    }

    function handleEvent(event: StreamEvent) {
        armWatchdog();
        options.onEvent(event);
    }

    async function subscribe(channel: string): Promise<boolean> {
        if (destroyed) {
            return false;
        }

        if (activeChannel === channel) {
            return true;
        }

        if (activeChannel) {
            echo()?.leave(activeChannel);
        }

        activeChannel = channel;

        const subscription = echo()?.private(channel);

        if (!subscription) {
            return false;
        }

        for (const name of STREAM_EVENTS) {
            subscription.listen(`.${name}`, (data: Record<string, unknown>) =>
                handleEvent({ type: name, ...data }),
            );
        }

        return await new Promise<boolean>((resolve) => {
            let settled = false;

            const settle = (value: boolean) => {
                if (settled) {
                    return;
                }

                settled = true;
                resolve(value);
            };

            subscription.subscribed(() => settle(true));
            subscription.error(() => settle(false));

            // A subscription that never completes must report failure rather
            // than silently pretending to be live, which is how events used to
            // be dropped with no way to notice.
            setTimeout(() => settle(false), SUBSCRIBE_TIMEOUT_MS);
        });
    }

    function onVisibilityChange() {
        if (document.visibilityState === 'visible') {
            options.onReconcile('visible');
        }
    }

    document.addEventListener('visibilitychange', onVisibilityChange);

    // A reconnect means the socket was down; anything sent in the gap is gone
    // from the broker, so the only way back to the truth is to re-read it.
    const connection = echo()?.connector?.pusher?.connection;
    const onConnected = () => options.onReconcile('reconnected');
    connection?.bind('connected', onConnected);

    return {
        subscribe,
        setStreaming(next: boolean) {
            streaming = next;
            if (next) {
                armWatchdog();
            } else {
                clearWatchdog();
            }
        },
        destroy() {
            destroyed = true;
            clearWatchdog();
            document.removeEventListener('visibilitychange', onVisibilityChange);
            connection?.unbind('connected', onConnected);

            if (activeChannel) {
                echo()?.leave(activeChannel);
                activeChannel = null;
            }
        },
    };
}
