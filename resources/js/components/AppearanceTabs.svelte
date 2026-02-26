<script lang="ts">
    import Monitor from 'lucide-svelte/icons/monitor';
    import Moon from 'lucide-svelte/icons/moon';
    import Sun from 'lucide-svelte/icons/sun';
    import type { Component, SvelteComponent } from 'svelte';
    import { themeState } from '@/lib/theme.svelte';
    import type { Appearance } from '@/types';

    const { appearance, updateAppearance } = themeState();

    type IconComponent =
        | Component<{ class?: string }>
        | (new (...args: any[]) => SvelteComponent<{ class?: string }>);

    const tabs: { value: Appearance; Icon: IconComponent; label: string }[] = [
        { value: 'light', Icon: Sun, label: 'Light' },
        { value: 'dark', Icon: Moon, label: 'Dark' },
        { value: 'system', Icon: Monitor, label: 'System' },
    ];

    function handleAppearanceChange(value: Appearance) {
        updateAppearance(value);
    }
</script>

<div class="inline-flex gap-1 rounded-xl bg-sidebar border border-sidebar-border p-1 shadow-inner shadow-black/[0.02] dark:shadow-black/20">
    {#each tabs as { value, Icon, label } (value)}
        <button
            onclick={() => handleAppearanceChange(value)}
            class="flex items-center rounded-lg px-4 py-2 transition-all duration-200 {appearance.value === value
                ? 'bg-background shadow-sm shadow-black/[0.04] text-foreground font-medium dark:bg-neutral-800'
                : 'text-muted-foreground hover:text-foreground hover:bg-neutral-200/40 dark:hover:bg-neutral-800/40'}"
        >
            <Icon class="-ml-1 h-4 w-4" />
            <span class="ml-2 text-sm">{label}</span>
        </button>
    {/each}
</div>
