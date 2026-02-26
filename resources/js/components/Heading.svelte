<script lang="ts">
    let {
        title,
        description = '',
        variant = 'default',
    }: {
        title: string;
        description?: string;
        variant?: 'default' | 'small';
    } = $props();
</script>

<header class={variant === 'small' ? '' : 'mb-8 space-y-1'}>
    <h2 class={variant === 'small' ? 'mb-0.5 text-base font-semibold tracking-tight text-foreground/90' : 'text-3xl font-semibold tracking-tight text-foreground/90'}>
        {title}
    </h2>
    {#if description}
        <p class={variant === 'small' ? 'text-sm text-muted-foreground' : 'text-base text-muted-foreground'}>{description}</p>
    {/if}
</header>
