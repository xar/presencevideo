<script lang="ts">
    import { Link } from '@inertiajs/svelte';
    import type { Snippet } from 'svelte';
    import AppLogoIcon from '@/components/AppLogoIcon.svelte';
    import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
    import { home } from '@/routes';

    let {
        title = '',
        description = '',
        children,
    }: {
        title?: string;
        description?: string;
        children?: Snippet;
    } = $props();
</script>

<div class="flex min-h-svh flex-col items-center justify-center gap-6 bg-gradient-to-b from-background to-sidebar p-6 md:p-10 relative overflow-hidden">
    <!-- Subtle animated background decoration -->
    <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 dark:bg-primary/10 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-pulse duration-10000"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/20 dark:bg-accent/10 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen animate-pulse duration-7000 animation-delay-2000"></div>

    <div class="flex w-full max-w-md flex-col gap-6 relative z-10">
        <Link href={home()} class="flex items-center justify-center gap-3 self-center font-bold text-2xl tracking-tight transition-transform hover:scale-105 duration-300">
            <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/25">
                <AppLogoIcon class="size-6 text-primary-foreground ml-0.5" />
            </div>
            <span class="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">Presence</span>
        </Link>

        <div class="flex flex-col gap-6">
            <Card class="rounded-2xl border-sidebar-border shadow-xl shadow-black/[0.04] dark:shadow-white/5 bg-card/95 backdrop-blur-sm overflow-hidden">
                <CardHeader class="px-10 pt-10 pb-2 text-center">
                    <CardTitle class="text-2xl font-semibold tracking-tight text-foreground/90">{title}</CardTitle>
                    {#if description}
                        <CardDescription class="mt-2">
                            {description}
                        </CardDescription>
                    {/if}
                </CardHeader>
                <CardContent class="px-10 pb-10 pt-6">
                    {@render children?.()}
                </CardContent>
            </Card>
        </div>
    </div>
</div>
