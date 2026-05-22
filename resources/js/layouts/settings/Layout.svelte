<script lang="ts">
    import type { Snippet } from 'svelte';
    import Heading from '@/components/Heading.svelte';
    import SettingsNav from '@/components/settings/SettingsNav.svelte';
    import { Separator } from '@/components/ui/separator';

    let {
        children,
    }: {
        children?: Snippet;
    } = $props();
</script>

<div class="px-4 py-6">
    <Heading title="Settings" description="Manage your profile and account settings" />

    <div class="flex flex-col lg:flex-row lg:space-x-12">
        <aside class="w-full max-w-xl lg:w-48">
            <SettingsNav />
        </aside>

        <Separator class="my-6 lg:hidden" />

        <div class="flex-1 md:max-w-2xl">
            <section class="max-w-xl space-y-12">
                {@render children?.()}
            </section>
        </div>
    </div>
</div>
