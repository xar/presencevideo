<script lang="ts">
    import { Button } from '@/components/ui/button';
    import { Input } from '@/components/ui/input';
    import { projectStore } from '@/lib/editor';
    import {
        BRAND_COLOR_ROLES,
        brandToken,
        isBrandToken,
        resolveBrandColor,
    } from '@/lib/editor/model/brand';

    /**
     * A colour field that understands brand tokens.
     *
     * The native colour input always shows the RESOLVED colour (so a token
     * reads as its swatch), the text field shows what is stored (a literal or
     * `brand.primary`), and when the project has a brand kit a small select
     * offers the kit's roles. Picking a literal from the swatch replaces a
     * token; picking a role stores the token, never the literal.
     */
    let {
        value,
        onchange,
        allowNone = false,
        placeholder = '',
    }: {
        value: string | null | undefined;
        onchange: (value: string) => void;
        /** Show a "None" button that stores 'transparent'. */
        allowNone?: boolean;
        placeholder?: string;
    } = $props();

    let kit = $derived(projectStore.project?.brand_kit ?? null);
    let isToken = $derived(isBrandToken(value));
    let swatch = $derived.by(() => {
        const resolved = resolveBrandColor(value, kit);
        if (!resolved || resolved === 'transparent') return '#000000';
        return resolved.slice(0, 7);
    });
    let isNone = $derived(!value || value === 'transparent' || value === 'none');

    function fromEvent(e: Event): string {
        return (e.target as HTMLInputElement | HTMLSelectElement).value;
    }
</script>

<div class="flex gap-1">
    <input
        type="color"
        value={swatch}
        oninput={(e) => onchange(fromEvent(e))}
        class="h-8 w-8 cursor-pointer rounded border"
        title={isToken ? `${value} → ${swatch}` : undefined}
    />
    <Input
        value={isNone ? '' : (value ?? '')}
        {placeholder}
        oninput={(e) => onchange(fromEvent(e))}
        class="h-8 min-w-0 flex-1 {isToken ? 'font-mono text-[11px]' : ''}"
    />
    {#if kit}
        <select
            value={isToken ? value : ''}
            onchange={(e) => {
                const role = fromEvent(e);
                if (role) onchange(role);
            }}
            class="h-8 w-8 rounded-md border bg-transparent px-1 text-xs"
            title="Use a brand colour"
            aria-label="Brand colour"
        >
            <option value="">—</option>
            {#each BRAND_COLOR_ROLES as role (role)}
                {#if kit.colors?.[role]}
                    <option value={brandToken(role)}>{role.replace('_', ' ')}</option>
                {/if}
            {/each}
        </select>
    {/if}
    {#if allowNone}
        <Button
            variant={isNone ? 'default' : 'outline'}
            size="sm"
            class="h-8 text-xs"
            onclick={() => onchange('transparent')}
        >
            None
        </Button>
    {/if}
</div>
