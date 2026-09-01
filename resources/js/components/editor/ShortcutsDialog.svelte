<script lang="ts">
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogTitle,
    } from '@/components/ui/dialog';

    let { open = $bindable(false) }: { open?: boolean } = $props();

    const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
    const mod = isMac ? '⌘' : 'Ctrl';

    const groups: { title: string; shortcuts: { keys: string[]; label: string }[] }[] = [
        {
            title: 'Playback',
            shortcuts: [
                { keys: ['Space'], label: 'Play / pause' },
                { keys: ['L'], label: 'Play (again: speed 1× → 1.5× → 2×)' },
                { keys: ['K'], label: 'Pause and reset speed to 1×' },
                { keys: ['J'], label: 'Back 1s (pauses)' },
                { keys: [','], label: 'Step back 1 frame' },
                { keys: ['.'], label: 'Step forward 1 frame' },
                { keys: ['←', '→'], label: 'Seek 100ms (Shift: 1s)' },
                { keys: ['Home'], label: 'Jump to start' },
                { keys: ['End'], label: 'Jump to end' },
            ],
        },
        {
            title: 'Editing',
            shortcuts: [
                { keys: [`${mod} Z`], label: 'Undo' },
                { keys: [`${mod} ⇧ Z`], label: 'Redo' },
                { keys: [`${mod} C`], label: 'Copy selection' },
                { keys: [`${mod} X`], label: 'Cut selection' },
                { keys: [`${mod} V`], label: 'Paste (layer in scene, clip at playhead)' },
                { keys: [`${mod} D`], label: 'Duplicate selection' },
                { keys: ['S'], label: 'Split clip at playhead' },
                { keys: ['⌫'], label: 'Delete selection' },
                { keys: ['↑', '↓', '←', '→'], label: 'Nudge layer 1px (Shift: 10px)' },
                { keys: ['Esc'], label: 'Deselect' },
            ],
        },
        {
            title: 'Tools & Project',
            shortcuts: [
                { keys: ['V'], label: 'Select tool' },
                { keys: ['H'], label: 'Pan tool' },
                { keys: [`${mod} +`], label: 'Zoom in timeline' },
                { keys: [`${mod} -`], label: 'Zoom out timeline' },
                { keys: [`${mod} 0`], label: 'Reset timeline zoom' },
                { keys: [`${mod} S`], label: 'Save project' },
                { keys: [`${mod} ⇧ E`], label: 'JSON code editor' },
                { keys: ['?'], label: 'Show this dialog' },
            ],
        },
    ];
</script>

<Dialog bind:open>
    <DialogContent class="max-w-lg">
        <DialogTitle>Keyboard Shortcuts</DialogTitle>
        <DialogDescription>Work faster in the editor with these shortcuts.</DialogDescription>

        <div class="grid gap-5">
            {#each groups as group (group.title)}
                <div>
                    <h3 class="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.title}
                    </h3>
                    <div class="grid gap-1.5">
                        {#each group.shortcuts as shortcut (shortcut.label)}
                            <div class="flex items-center justify-between gap-4 text-sm">
                                <span>{shortcut.label}</span>
                                <span class="flex shrink-0 gap-1">
                                    {#each shortcut.keys as key (key)}
                                        <kbd class="rounded border bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                                            {key}
                                        </kbd>
                                    {/each}
                                </span>
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    </DialogContent>
</Dialog>
