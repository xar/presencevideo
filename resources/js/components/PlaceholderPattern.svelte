<script lang="ts">
    const patternId = `pattern-${Math.random().toString(36).substring(2, 9)}`;
</script>

<div class="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5">
    <svg class="absolute inset-0 size-full stroke-primary/10 dark:stroke-primary/20 mix-blend-multiply dark:mix-blend-screen" fill="none">
        <defs>
            <pattern id={patternId} x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
                <path d="M-1 7L7 -1M5 13L13.5 4.5" stroke-width="0.5" stroke-linecap="round"></path>
            </pattern>
        </defs>
        <rect stroke="none" fill={`url(#${patternId})`} width="100%" height="100%"></rect>
    </svg>
</div>
