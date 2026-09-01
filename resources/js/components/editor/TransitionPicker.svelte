<script lang="ts">
    import { Diamond, Plus, X } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogTitle,
    } from '@/components/ui/dialog';
    import { Input } from '@/components/ui/input';
    import { Label } from '@/components/ui/label';
    import { projectStore } from '@/lib/editor';
    import {
        clampTransitionMs,
        DEFAULT_TRANSITION_MS,
        MAX_TRANSITION_MS,
        MIN_TRANSITION_MS,
        TRANSITION_OPTIONS,
        transitionLabel,
    } from '@/lib/editor/transitions';
    import type { Scene, TransitionType } from '@/types';

    type Props = {
        /** The scene the transition is stored on (plays between it and the next). */
        scene: Scene;
        /** The following scene; without it the transition would never render. */
        nextScene: Scene;
        /** `diamond` for the scene strip, `inline` for the properties panel. */
        variant?: 'diamond' | 'inline';
    };

    let { scene, nextScene, variant = 'diamond' }: Props = $props();

    let open = $state(false);
    let durationMs = $state(DEFAULT_TRANSITION_MS);

    let transition = $derived(scene.transition ?? null);
    let maxDurationMs = $derived(clampTransitionMs(MAX_TRANSITION_MS, scene, nextScene));

    function openPicker() {
        durationMs = transition?.duration_ms ?? DEFAULT_TRANSITION_MS;
        open = true;
    }

    function selectType(type: TransitionType) {
        projectStore.updateScene(scene.id, {
            transition: { type, duration_ms: clampTransitionMs(durationMs, scene, nextScene) },
        });
    }

    function updateDuration(e: Event) {
        const seconds = parseFloat((e.target as HTMLInputElement).value);
        if (Number.isNaN(seconds)) return;

        durationMs = clampTransitionMs(seconds * 1000, scene, nextScene);

        if (transition) {
            projectStore.updateScene(scene.id, {
                transition: { type: transition.type, duration_ms: durationMs },
            });
        }
    }

    function removeTransition() {
        projectStore.updateScene(scene.id, { transition: null });
        open = false;
    }
</script>

{#if variant === 'diamond'}
    <button
        type="button"
        title={transition ? `Transition: ${transitionLabel(transition.type)}` : 'Add transition'}
        aria-label={transition ? `Edit transition: ${transitionLabel(transition.type)}` : 'Add transition'}
        class="z-10 flex h-5 w-5 shrink-0 -translate-x-1/2 items-center justify-center rounded-sm border bg-background text-muted-foreground shadow-sm transition-colors hover:border-primary hover:text-primary
        {transition ? 'border-primary text-primary' : 'border-border opacity-60 hover:opacity-100'}"
        onpointerdown={(e) => e.stopPropagation()}
        onclick={(e) => {
            e.stopPropagation();
            openPicker();
        }}
    >
        {#if transition}
            <Diamond class="h-3 w-3 fill-current" />
        {:else}
            <Plus class="h-3 w-3" />
        {/if}
    </button>
{:else}
    <Button variant="outline" size="sm" class="h-8 w-full justify-between" onclick={openPicker}>
        <span class="truncate">{transitionLabel(transition?.type)}</span>
        {#if transition}
            <span class="text-xs text-muted-foreground tabular-nums">
                {(transition.duration_ms / 1000).toFixed(1)}s
            </span>
        {/if}
    </Button>
{/if}

<Dialog bind:open>
    <DialogContent class="sm:max-w-md">
        <DialogTitle>Scene Transition</DialogTitle>
        <DialogDescription>
            Plays between “{scene.name ?? 'this scene'}” and “{nextScene.name ?? 'the next scene'}”.
        </DialogDescription>

        <div class="grid gap-4 py-2">
            <div class="grid grid-cols-3 gap-2">
                <button
                    type="button"
                    class="flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors hover:border-primary
                    {transition ? 'border-border' : 'border-primary bg-primary/10'}"
                    onclick={removeTransition}
                >
                    <X class="h-4 w-4" />
                    None
                </button>
                {#each TRANSITION_OPTIONS as option (option.value)}
                    <button
                        type="button"
                        class="flex flex-col items-center gap-1 rounded-md border p-2 text-xs transition-colors hover:border-primary
                        {transition?.type === option.value ? 'border-primary bg-primary/10' : 'border-border'}"
                        onclick={() => selectType(option.value)}
                    >
                        <Diamond class="h-4 w-4 {option.previewable ? 'fill-current' : ''}" />
                        <span class="text-center leading-tight">{option.label}</span>
                    </button>
                {/each}
            </div>

            <div class="grid gap-2">
                <Label for="transition-duration" class="text-xs">Duration (seconds)</Label>
                <Input
                    id="transition-duration"
                    type="number"
                    step="0.1"
                    min={MIN_TRANSITION_MS / 1000}
                    max={maxDurationMs / 1000}
                    value={(durationMs / 1000).toFixed(1)}
                    onchange={updateDuration}
                    class="h-8"
                />
                <p class="text-xs text-muted-foreground">
                    Capped at {(maxDurationMs / 1000).toFixed(1)}s (half of the shortest neighbouring scene).
                </p>
            </div>
        </div>

        <DialogFooter>
            <Button variant="outline" size="sm" onclick={removeTransition} disabled={!transition}>
                Remove
            </Button>
            <Button size="sm" onclick={() => (open = false)}>Done</Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
