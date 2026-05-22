<script lang="ts">
    import { Link } from '@inertiajs/svelte';
    import AppLogo from '@/components/AppLogo.svelte';
    import { appHome } from '@/lib/navigation';
    import { toUrl } from '@/lib/utils';
</script>

<Link href={toUrl(appHome)} class="flex items-center gap-x-2">
    <AppLogo />
</Link>
