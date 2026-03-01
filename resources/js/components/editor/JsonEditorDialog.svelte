<script lang="ts">
    import { Check, AlertCircle, Copy, RotateCcw, WrapText } from 'lucide-svelte';
    import { Button } from '@/components/ui/button';
    import {
        Dialog,
        DialogContent,
        DialogDescription,
        DialogFooter,
        DialogTitle,
    } from '@/components/ui/dialog';
    import { projectStore } from '@/lib/editor';
    import { serializeProject, validateProjectData } from '@/lib/editor/project-json';

    let {
        open = $bindable(false),
    }: {
        open: boolean;
    } = $props();

    let code = $state('');
    let initialCode = $state('');
    let copied = $state(false);
    let copiedTimer: ReturnType<typeof setTimeout> | null = null;

    // Re-serialize when dialog opens
    $effect(() => {
        if (open && projectStore.project) {
            const json = serializeProject(projectStore.project);
            code = json;
            initialCode = json;
        }
    });

    let validation = $derived.by(() => {
        try {
            const parsed = JSON.parse(code);
            return validateProjectData(parsed);
        } catch (e) {
            return { valid: false as const, error: (e as SyntaxError).message };
        }
    });

    let hasChanges = $derived(code !== initialCode);
    let canApply = $derived(validation.valid && hasChanges);

    function handleFormat() {
        try {
            const parsed = JSON.parse(code);
            code = JSON.stringify(parsed, null, 2);
        } catch {
            // Can't format invalid JSON
        }
    }

    function handleCopy() {
        navigator.clipboard.writeText(code);
        copied = true;
        if (copiedTimer) clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => {
            copied = false;
        }, 2000);
    }

    function handleReset() {
        code = initialCode;
    }

    function handleApply() {
        if (!validation.valid) return;
        projectStore.updateProject(validation.data);
        initialCode = code;
        open = false;
    }

    function handleKeydown(e: KeyboardEvent) {
        // Cmd+Enter to apply
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            if (canApply) handleApply();
        }

        // Tab inserts 2 spaces
        if (e.key === 'Tab') {
            e.preventDefault();
            const textarea = e.target as HTMLTextAreaElement;
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            code = code.substring(0, start) + '  ' + code.substring(end);
            // Restore cursor position after Svelte updates the DOM
            requestAnimationFrame(() => {
                textarea.selectionStart = textarea.selectionEnd = start + 2;
            });
        }
    }
</script>

<Dialog bind:open>
    <DialogContent class="sm:max-w-4xl h-[85vh] flex flex-col">
        <DialogTitle>Project JSON Editor</DialogTitle>
        <DialogDescription>
            View and edit the raw project data. Changes are applied when you click "Apply Changes".
        </DialogDescription>

        <!-- Toolbar -->
        <div class="flex items-center gap-2">
            <Button variant="outline" size="sm" onclick={handleFormat}>
                <WrapText class="mr-1.5 h-3.5 w-3.5" />
                Format
            </Button>
            <Button variant="outline" size="sm" onclick={handleCopy}>
                {#if copied}
                    <Check class="mr-1.5 h-3.5 w-3.5" />
                    Copied
                {:else}
                    <Copy class="mr-1.5 h-3.5 w-3.5" />
                    Copy
                {/if}
            </Button>
            <Button variant="outline" size="sm" onclick={handleReset} disabled={!hasChanges}>
                <RotateCcw class="mr-1.5 h-3.5 w-3.5" />
                Reset
            </Button>

            <div class="ml-auto flex items-center gap-1.5 text-xs">
                {#if validation.valid}
                    <Check class="h-3.5 w-3.5 text-emerald-500" />
                    <span class="text-emerald-500">Valid JSON</span>
                {:else}
                    <AlertCircle class="h-3.5 w-3.5 text-destructive" />
                    <span class="text-destructive truncate max-w-[300px]">{validation.error}</span>
                {/if}
            </div>
        </div>

        <!-- Editor -->
        <textarea
            class="flex-1 w-full resize-none rounded-md border bg-muted/50 p-3 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring"
            spellcheck="false"
            autocomplete="off"
            autocapitalize="off"
            bind:value={code}
            onkeydown={handleKeydown}
        ></textarea>

        <DialogFooter>
            <Button variant="outline" onclick={() => (open = false)}>Cancel</Button>
            <Button onclick={handleApply} disabled={!canApply}>
                Apply Changes
            </Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
