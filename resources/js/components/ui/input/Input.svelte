<script lang="ts">
    import { cn } from '@/lib/utils';

    let { class: className = '', type = 'text', ...rest } = $props();
</script>

<div class="relative group">
    <input
        type={type}
        class={cn(
            'flex h-12 w-full rounded-xl border-2 border-border/50 bg-background px-4 py-2 text-sm shadow-sm transition-all duration-300 file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50 hover:border-border group-hover:border-primary/50',
            className,
        )}
        {...rest}
    />
</div>
